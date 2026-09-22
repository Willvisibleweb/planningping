// Shared upsert for ingested applications. Every PlanIt path (daily ingest,
// national backfill, history backfill, add-territory fetch) writes through
// here, and it scores each new/changed row inline so Leads is populated
// without a separate /api/score run.
//
// The write decision itself lives in lib/reliability/ingestPlan.ts, which has
// no database in it and is covered by tests for idempotency and overlapping
// windows. This file does the reading, the writing and the side records:
//
//   - every source fact is compared (content_hash), not just status + decision
//     date, so a revised description or address actually reaches the row;
//   - what changed is appended to application_changes;
//   - the raw source record is kept in application_source_snapshots;
//   - rows that arrived unchanged still get last_seen_at, so "last checked"
//     means last checked rather than last changed;
//   - new rows are compared against existing ones and possible duplicates are
//     flagged for review (never merged).
//
// Existing rows are read per council in pages. The previous single select was
// silently capped at 1,000 rows by PostgREST: Coventry holds 1,562, so 562 of
// its applications were invisible here, re-announced as "new" whenever they
// reappeared, and could never produce a decision alert.

import { createHash } from 'crypto'
import { scoreApplication } from '@/lib/scoring/scoreApplication'
import { SCORING_VERSION } from '@/lib/scoring/civilsCriteria'
import { classifyApplication } from '@/lib/classification/classifyApplication'
import { classifyDecision, isDecided, type DecisionOutcome } from '@/lib/classification/decisionOutcome'
import { syncAgentOrganisations, type AgentOrganisationSource } from '@/lib/organisations/syncProjectOrganisations'
import { planIngest, type IncomingRecord, type PlannedWrite, type StoredRecord } from '@/lib/reliability/ingestPlan'
import { findDuplicateCandidates, normaliseReference, type DuplicateSubject } from '@/lib/reliability/duplicates'
import type { TrackedValues } from '@/lib/reliability/sourceChanges'
import { logPipelineEvent, type PipelineJob } from '@/lib/reliability/pipelineLog'
import type { PlanItApplication } from '@/lib/planit'
import type { createAdminClient } from '@/lib/supabase/admin'

type AdminClient = ReturnType<typeof createAdminClient>

export type SourceType = 'planit' | 'legacy_scrape' | 'manual'

export interface IngestSource {
  type: SourceType
  recordId: string | null
  url: string | null
  lastChangedAt: string | null
  /** The record verbatim, kept as the provenance snapshot. */
  payload: Record<string, unknown> | null
}

export interface IngestApplication {
  council_slug: string
  reference: string
  address: string | null
  description: string | null
  status: string | null
  application_date: string | null
  decision_date: string | null
  agent_company: string | null
  target_decision_date: string | null
  raw_data: Record<string, unknown> | null
  source?: IngestSource
}

// Richer than new_refs — the alert fan-out (app/api/cron/ingest/route.ts)
// needs enough of the row to filter by band and build an email without a
// second round-trip to the DB. id is attached after the upsert — the discharge
// alert path needs it to query children/parents by id.
export interface NewApplication {
  id: string | null
  council_slug: string
  reference: string
  description: string | null
  address: string | null
  application_date: string | null
  band: string | null
  application_type: string | null
  parent_application_reference: string | null
}

// An application that crossed from undecided to decided during this run. Only
// the transition counts — see decision_alerted_at in migration 0017 for why
// alerting on the state itself would announce years of history as news.
export interface DecidedApplication {
  id: string | null
  council_slug: string
  reference: string
  description: string | null
  address: string | null
  status: string | null
  decision_date: string | null
  outcome: DecisionOutcome
  band: string | null
}

export interface UpsertResult {
  received: number
  /** Rows written: new, or with changed source values. */
  changed: number
  /** Existing rows given agent/target-decision values they were missing. */
  enriched: number
  /** Rows that arrived with nothing changed (last_seen_at refreshed). */
  unchanged: number
  new_refs: string[]
  new_applications: NewApplication[]
  decided_applications: DecidedApplication[]
  /** council|reference of every row written this call. */
  written_keys: string[]
  changes_recorded: number
  /** The same application received twice in one batch (overlapping queries). */
  collapsed_in_batch: number
  /** References matched to a stored spelling differing only in spacing/case. */
  reference_variants_resolved: number
  duplicate_candidates: number
  /** Non-fatal side-record failures, each also logged to pipeline_events. */
  warnings: number
}

export interface UpsertContext {
  runId?: string | null
  job?: PipelineJob
}

// The columns added by 0036. If the code is deployed before the migration is
// applied, the upsert retries without them rather than stopping ingestion.
const RELIABILITY_COLUMNS = [
  'source_type',
  'source_record_id',
  'source_url',
  'source_last_changed_at',
  'last_seen_at',
  'content_hash',
  'scored_at',
  'scoring_version',
] as const

const PAGE = 1000
const ID_CHUNK = 200
const WRITE_CHUNK = 500

// Status + decision date only — kept because the n8n webhook and older rows
// use it. content_hash is what now decides whether a row changed.
function stateHash(status: string | null, decisionDate: string | null): string {
  return createHash('sha256').update(`${status ?? ''}|${decisionDate ?? ''}`).digest('hex')
}

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

function isMissingColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return error.code === 'PGRST204' || error.code === '42703' || /column .* does not exist|could not find the '.*' column/i.test(error.message ?? '')
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

/** The one mapping from a PlanIt record to an ingest row. */
export function fromPlanIt(app: PlanItApplication, councilSlug: string): IngestApplication {
  return {
    council_slug: councilSlug,
    reference: app.reference,
    address: app.address,
    description: app.description,
    status: app.status,
    application_date: app.applicationDate,
    decision_date: app.decisionDate,
    agent_company: app.agentCompany,
    target_decision_date: app.targetDecisionDate,
    raw_data: { source: 'planit', url: app.url, app_type: app.appType, lat: app.lat, lng: app.lng },
    source: {
      type: 'planit',
      recordId: app.sourceRecordId,
      url: app.url,
      lastChangedAt: app.sourceLastChangedAt,
      payload: app.raw,
    },
  }
}

function incomingValues(a: IngestApplication): TrackedValues {
  return {
    status: a.status,
    decision_date: a.decision_date,
    description: a.description,
    address: a.address,
    agent_company: a.agent_company,
    target_decision_date: a.target_decision_date,
    application_date: a.application_date,
    app_type: stringOrNull(a.raw_data?.app_type),
    source_url: a.source?.url ?? stringOrNull(a.raw_data?.url),
  }
}

interface StoredRow {
  id: string
  council_slug: string
  reference: string
  status: string | null
  decision_date: string | null
  description: string | null
  address: string | null
  agent_company: string | null
  target_decision_date: string | null
  application_date: string | null
  raw_data: Record<string, unknown> | null
  source_url?: string | null
  content_hash?: string | null
  decision_alerted_at: string | null
}

const FULL_COLUMNS =
  'id, council_slug, reference, status, decision_date, description, address, agent_company, target_decision_date, application_date, raw_data, decision_alerted_at'

export async function upsertApplications(
  supabase: AdminClient,
  apps: IngestApplication[],
  ctx: UpsertContext = {},
): Promise<UpsertResult> {
  const job: PipelineJob = ctx.job ?? 'ingest'
  const now = new Date().toISOString()
  let legacySchema = false
  let warnings = 0

  const warn = async (stage: string, message: string, error?: unknown, councilSlug?: string) => {
    warnings++
    await logPipelineEvent(supabase, { runId: ctx.runId, job, stage, severity: 'warning', message, error, councilSlug })
  }

  const byCouncil = new Map<string, IngestApplication[]>()
  for (const a of apps) {
    if (!a.reference?.trim() || !a.council_slug) continue
    const list = byCouncil.get(a.council_slug) ?? []
    list.push(a)
    byCouncil.set(a.council_slug, list)
  }

  const result: UpsertResult = {
    received: apps.length,
    changed: 0,
    enriched: 0,
    unchanged: 0,
    new_refs: [],
    new_applications: [],
    decided_applications: [],
    written_keys: [],
    changes_recorded: 0,
    collapsed_in_batch: 0,
    reference_variants_resolved: 0,
    duplicate_candidates: 0,
    warnings: 0,
  }
  const agentSources: AgentOrganisationSource[] = []

  for (const [council, list] of byCouncil) {
    // 1. Every stored reference for this council, paged — the variant check
    //    and the new/existing decision both need the complete set.
    const refIndex = new Map<string, string>() // normalised reference -> id
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('planning_applications')
        .select('id, reference')
        .eq('council_slug', council)
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1)
      if (error) throw new Error(`reading existing applications for ${council} failed: ${error.message}`)
      for (const r of (data ?? []) as { id: string; reference: string }[]) refIndex.set(normaliseReference(r.reference), r.id)
      if (!data || data.length < PAGE) break
    }

    // 2. Full rows only for the applications that arrived.
    const neededIds = [...new Set(list.map((a) => refIndex.get(normaliseReference(a.reference))).filter((id): id is string => !!id))]
    const storedRows: StoredRow[] = []
    // The column list is chosen at runtime (with or without 0036), which the
    // client cannot type from a string, so the row shape is asserted here.
    const readRows = (columns: string, ids: string[]) =>
      supabase.from('planning_applications').select(columns).in('id', ids) as unknown as PromiseLike<{
        data: unknown[] | null
        error: { message: string; code?: string } | null
      }>
    for (const ids of chunk(neededIds, ID_CHUNK)) {
      let res = await readRows(legacySchema ? FULL_COLUMNS : `${FULL_COLUMNS}, source_url, content_hash`, ids)
      if (res.error && !legacySchema && isMissingColumn(res.error)) {
        legacySchema = true
        res = await readRows(FULL_COLUMNS, ids)
      }
      if (res.error) throw new Error(`reading application details for ${council} failed: ${res.error.message}`)
      storedRows.push(...((res.data ?? []) as unknown as StoredRow[]))
    }
    const storedById = new Map(storedRows.map((r) => [r.id, r]))

    const stored: StoredRecord[] = storedRows.map((r) => ({
      id: r.id,
      council_slug: r.council_slug,
      reference: r.reference,
      content_hash: r.content_hash ?? null,
      values: {
        status: r.status,
        decision_date: r.decision_date,
        description: r.description,
        address: r.address,
        agent_company: r.agent_company,
        target_decision_date: r.target_decision_date,
        application_date: r.application_date,
        app_type: stringOrNull(r.raw_data?.app_type),
        source_url: r.source_url ?? stringOrNull(r.raw_data?.url),
      },
    }))

    const incoming: IncomingRecord[] = list.map((a) => ({ council_slug: council, reference: a.reference, values: incomingValues(a) }))
    const appByIncomingRef = new Map<string, IngestApplication>()
    for (const a of list) if (!appByIncomingRef.has(a.reference)) appByIncomingRef.set(a.reference, a)

    const plan = planIngest(incoming, stored)
    result.collapsed_in_batch += plan.collapsedInBatch
    result.reference_variants_resolved += plan.referenceVariantsResolved

    // 3. Rows to write.
    const rows: Record<string, unknown>[] = []
    const writeByKey = new Map<string, PlannedWrite>()
    for (const w of plan.writes) {
      const a = appByIncomingRef.get(w.incomingReference)!
      const { score, band, matchedReasons } = scoreApplication({
        reference: w.reference,
        description: w.values.description,
        address: w.values.address,
      })
      const { applicationType, parentReferenceRaw, needsReview } = classifyApplication({
        description: w.values.description,
        appType: w.values.app_type,
      })
      const row: Record<string, unknown> = {
        council_slug: council,
        reference: w.reference,
        address: w.values.address,
        description: w.values.description,
        status: w.values.status,
        application_date: w.values.application_date,
        decision_date: w.values.decision_date,
        agent_company: w.values.agent_company,
        target_decision_date: w.values.target_decision_date,
        state_hash: stateHash(w.values.status, w.values.decision_date),
        raw_data: a.raw_data,
        last_scraped_at: now,
        score,
        band,
        score_reasons: matchedReasons,
        application_type: applicationType,
        parent_application_reference: parentReferenceRaw,
        parent_reference_needs_review: needsReview,
        source_type: a.source?.type ?? 'legacy_scrape',
        source_record_id: a.source?.recordId ?? null,
        source_url: w.values.source_url,
        source_last_changed_at: a.source?.lastChangedAt ?? null,
        last_seen_at: now,
        content_hash: w.contentHash,
        scored_at: now,
        scoring_version: SCORING_VERSION,
      }
      if (legacySchema) for (const c of RELIABILITY_COLUMNS) delete row[c]
      rows.push(row)
      writeByKey.set(`${council}|${w.reference}`, w)

      const prev = w.previous ? storedById.get(w.previous.id) ?? null : null
      if (prev && ((!prev.agent_company && w.values.agent_company) || (!prev.target_decision_date && w.values.target_decision_date))) {
        result.enriched++
      }

      // Decision detection. Four guards, all necessary:
      //   !isNew          — a brand-new row arriving already decided is history
      //                     we never saw undecided, not news.
      //   !alreadyAlerted — at-most-once, even if a council rewrites the status.
      //   !wasDecided     — the transition, not the state.
      //   outcome         — it actually reads as a decision now.
      const outcome = classifyDecision(w.values.status)
      if (!w.isNew && prev && prev.decision_alerted_at === null && !isDecided(prev.status) && outcome) {
        result.decided_applications.push({
          id: prev.id,
          council_slug: council,
          reference: w.reference,
          description: w.values.description,
          address: w.values.address,
          status: w.values.status,
          decision_date: w.values.decision_date,
          outcome,
          band,
        })
      }
      if (w.isNew) {
        result.new_refs.push(w.reference)
        result.new_applications.push({
          id: null,
          council_slug: council,
          reference: w.reference,
          description: w.values.description,
          address: w.values.address,
          application_date: w.values.application_date,
          band,
          application_type: applicationType,
          parent_application_reference: parentReferenceRaw,
        })
      }
    }

    // 4. Write. A failure here is the one that stops the run: the caller
    //    records it against the source.
    const idByKey = new Map<string, string>()
    for (const part of chunk(rows, WRITE_CHUNK)) {
      let res = await supabase
        .from('planning_applications')
        .upsert(part, { onConflict: 'council_slug,reference', ignoreDuplicates: false })
        .select('id, council_slug, reference')
      if (res.error && !legacySchema && isMissingColumn(res.error)) {
        legacySchema = true
        await logPipelineEvent(supabase, {
          runId: ctx.runId,
          job,
          stage: 'upsert',
          severity: 'critical',
          message: 'Migration 0036 is not applied: writing without provenance columns. Apply supabase/migrations/0036_data_reliability.sql.',
          councilSlug: council,
        })
        for (const row of part) for (const c of RELIABILITY_COLUMNS) delete row[c]
        res = await supabase
          .from('planning_applications')
          .upsert(part, { onConflict: 'council_slug,reference', ignoreDuplicates: false })
          .select('id, council_slug, reference')
      }
      if (res.error) throw new Error(`upsert failed for ${council}: ${res.error.message}`)
      for (const r of (res.data ?? []) as { id: string; council_slug: string; reference: string }[]) {
        idByKey.set(`${r.council_slug}|${r.reference}`, r.id)
      }
    }
    result.changed += rows.length
    for (const key of writeByKey.keys()) result.written_keys.push(key)
    for (const na of result.new_applications) {
      if (na.id === null && na.council_slug === council) na.id = idByKey.get(`${council}|${na.reference}`) ?? null
    }
    result.unchanged += plan.unchanged.length

    if (legacySchema) {
      for (const w of plan.writes) {
        const id = idByKey.get(`${council}|${w.reference}`)
        if (id && w.values.agent_company) agentSources.push({ applicationId: id, agentCompany: w.values.agent_company, sourceUrl: w.values.source_url, sourceCheckedAt: now })
      }
      continue
    }

    // 5. "Last checked" for everything that arrived unchanged.
    for (const ids of chunk(plan.unchanged.map((u) => u.id), ID_CHUNK)) {
      const { error } = await supabase.from('planning_applications').update({ last_seen_at: now }).in('id', ids)
      if (error) await warn('last_seen', `Could not stamp last_seen_at for ${ids.length} unchanged applications`, error.message, council)
    }

    // 6. Change history.
    const changeRows = plan.writes.flatMap((w) =>
      w.previous
        ? w.changes.map((c) => ({
            application_id: w.previous!.id,
            field: c.field,
            old_value: c.old_value,
            new_value: c.new_value,
            source_type: appByIncomingRef.get(w.incomingReference)?.source?.type ?? null,
            run_id: ctx.runId ?? null,
          }))
        : [],
    )
    for (const part of chunk(changeRows, WRITE_CHUNK)) {
      const { error } = await supabase.from('application_changes').insert(part)
      if (error) await warn('history', `Could not record ${part.length} application changes`, error.message, council)
      else result.changes_recorded += part.length
    }

    // 7. Raw source snapshots, only when the content changed.
    const snapshots = plan.writes.flatMap((w) => {
      const a = appByIncomingRef.get(w.incomingReference)
      const id = idByKey.get(`${council}|${w.reference}`)
      if (!a?.source?.payload || !id) return []
      return [{
        application_id: id,
        source_type: a.source.type,
        source_record_id: a.source.recordId,
        payload: a.source.payload,
        payload_hash: createHash('sha256').update(JSON.stringify(a.source.payload)).digest('hex'),
        captured_at: now,
      }]
    })
    for (const part of chunk(snapshots, ID_CHUNK)) {
      const { error } = await supabase.from('application_source_snapshots').upsert(part, { onConflict: 'application_id' })
      if (error) await warn('snapshot', `Could not store ${part.length} source snapshots`, error.message, council)
    }

    // 8. Possible duplicates among the new rows. Flags only.
    const newSubjects: DuplicateSubject[] = plan.writes
      .filter((w) => w.isNew)
      .flatMap((w) => {
        const id = idByKey.get(`${council}|${w.reference}`)
        return id
          ? [{ id, council_slug: council, reference: w.reference, address: w.values.address, description: w.values.description, application_date: w.values.application_date, source_url: w.values.source_url }]
          : []
      })
    if (newSubjects.length > 0) {
      try {
        const found = await flagDuplicates(supabase, council, newSubjects)
        result.duplicate_candidates += found
      } catch (e) {
        await warn('duplicates', 'Duplicate check failed', e, council)
      }
    }

    for (const w of plan.writes) {
      const id = idByKey.get(`${council}|${w.reference}`)
      if (id && w.values.agent_company) {
        agentSources.push({ applicationId: id, agentCompany: w.values.agent_company, sourceUrl: w.values.source_url, sourceCheckedAt: now })
      }
    }
  }

  // Project-team records are enrichment, not a reason to fail core planning
  // ingestion.
  try {
    await syncAgentOrganisations(supabase, agentSources)
  } catch (error) {
    await warn('org_sync', 'Project organisation sync failed', error)
  }

  result.warnings = warnings
  return result
}

const SUBJECT_COLUMNS = 'id, council_slug, reference, address, description, application_date, source_url'

async function flagDuplicates(supabase: AdminClient, council: string, subjects: DuplicateSubject[]): Promise<number> {
  const ids = new Set(subjects.map((s) => s.id))
  const existing = new Map<string, DuplicateSubject>()

  const dates = [...new Set(subjects.map((s) => s.application_date).filter((d): d is string => !!d))]
  for (const part of chunk(dates, 100)) {
    const { data, error } = await supabase
      .from('planning_applications')
      .select(SUBJECT_COLUMNS)
      .eq('council_slug', council)
      .in('application_date', part)
      .limit(2000)
    if (error) throw new Error(error.message)
    for (const r of (data ?? []) as DuplicateSubject[]) if (!ids.has(r.id)) existing.set(r.id, r)
  }

  const urls = [...new Set(subjects.map((s) => s.source_url).filter((u): u is string => !!u))]
  for (const part of chunk(urls, 100)) {
    const { data, error } = await supabase.from('planning_applications').select(SUBJECT_COLUMNS).in('source_url', part)
    if (error) throw new Error(error.message)
    for (const r of (data ?? []) as DuplicateSubject[]) if (!ids.has(r.id)) existing.set(r.id, r)
  }

  const matches = findDuplicateCandidates(subjects, [...existing.values()])
  if (matches.length === 0) return 0
  const { error } = await supabase.from('duplicate_candidates').upsert(
    matches.map((m) => ({
      application_id: m.applicationId,
      candidate_id: m.candidateId,
      match_type: m.matchType,
      confidence: m.confidence,
      evidence: m.evidence,
    })),
    { onConflict: 'application_id,candidate_id', ignoreDuplicates: true },
  )
  if (error) throw new Error(error.message)
  return matches.length
}
