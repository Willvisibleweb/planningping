// One source, fetched and ingested end to end.
//
// This is the body of the old ingest loop, lifted out so that a queued worker
// and the one-shot route run identical code. Everything it does is scoped to a
// single PlanIt query: fetch the submission window, fetch the change window,
// upsert, record what happened, and send the alerts that query earned.
//
// What it deliberately does NOT do is decide what happens next. It reports the
// outcome — including whether the failure was a rate limit — and the caller
// applies the backoff. That split is what lets one source fail without costing
// any other source its slot, which the single-function ingest could not do.

import type { createAdminClient } from '@/lib/supabase/admin'
import { queryPlanIt, PlanItError, type PlanItQueryResult } from '@/lib/planit'
import { fromPlanIt, upsertApplications, type IngestApplication } from '@/lib/ingest/upsertApplications'
import type { CouncilResolver } from '@/lib/ingest/councilResolver'
import { planChangeWindow, planSubmissionWindow } from '@/lib/reliability/fetchWindows'
import { logPipelineEvent, recordSourceRun, updateSourceRunCounts } from '@/lib/reliability/pipelineLog'
import { resolveDischargeParents } from '@/lib/ingest/resolveDischargeParents'
import { sendDischargeAlerts } from '@/lib/alerts/dischargeAlerts'
import { sendDecisionAlerts } from '@/lib/alerts/decisionAlerts'
import { sendBatchedAlerts, type AreaRow } from '@/lib/ingest/areaAlerts'

type AdminClient = ReturnType<typeof createAdminClient>

export interface SourceJob {
  queryKey: string
  sourceKey: string
  sourceLabel: string | null
  councilSlug: string | null
  postcode: string
  radiusKm: number
  areas: AreaRow[]
  lastSuccessAt: string | null
}

export interface SourceOutcome {
  status: 'success' | 'partial' | 'failed'
  /** True when PlanIt answered 429 — the caller backs off harder for these. */
  rateLimited: boolean
  httpStatus: number | null
  error: string | null
  fetched: number
  changedSinceLastSync: number | null
  window: string | null
  changed: number
  unchanged: number
  enriched: number
  newRefs: number
  newAnnounced: number
  changesRecorded: number
  duplicateCandidates: number
  collapsedInBatch: number
  referenceVariantsResolved: number
  warnings: number
  alertsSent: number
  dischargeParentsResolved: number
  dischargeAlertsSent: number
  decisionsDetected: number
  decisionAlertsSent: number
}

function emptyOutcome(): SourceOutcome {
  return {
    status: 'failed',
    rateLimited: false,
    httpStatus: null,
    error: null,
    fetched: 0,
    changedSinceLastSync: null,
    window: null,
    changed: 0,
    unchanged: 0,
    enriched: 0,
    newRefs: 0,
    newAnnounced: 0,
    changesRecorded: 0,
    duplicateCandidates: 0,
    collapsedInBatch: 0,
    referenceVariantsResolved: 0,
    warnings: 0,
    alertsSent: 0,
    dischargeParentsResolved: 0,
    dischargeAlertsSent: 0,
    decisionsDetected: 0,
    decisionAlertsSent: 0,
  }
}

/** Pause between the submission pass and the change pass, to stay polite. */
const CHANGE_PASS_DELAY_MS = 2500

export async function ingestOneSource(
  supabase: AdminClient,
  job: SourceJob,
  ctx: { runId: string | null; resolver: CouncilResolver; siteUrl: string },
): Promise<SourceOutcome> {
  const { runId, resolver, siteUrl } = ctx
  const outcome = emptyOutcome()
  const now = new Date()
  const queryStarted = new Date()
  const where = { kind: 'postcode' as const, postcode: job.postcode, radiusKm: job.radiusKm }

  // Submission window: rolling 30 days, or back to the last success after an
  // outage. Change window: everything whose content changed since the last
  // success, however old — this is what picks up decisions.
  const window = planSubmissionWindow(job.lastSuccessAt, now)
  const changeWindow = planChangeWindow(job.lastSuccessAt, now)
  outcome.window = window.mode === 'recovery' ? window.reason : null

  let submitted: PlanItQueryResult
  try {
    submitted = await queryPlanIt(
      where,
      { kind: 'submitted', startDate: window.startDate, endDate: window.endDate },
      { background: true },
    )
  } catch (e) {
    const rateLimited = e instanceof PlanItError && e.httpStatus === 429
    outcome.rateLimited = rateLimited
    outcome.httpStatus = e instanceof PlanItError ? e.httpStatus : null
    outcome.error = String(e)
    await recordSourceRun(supabase, {
      runId, job: 'ingest', sourceKey: job.sourceKey, sourceLabel: job.sourceLabel ?? job.postcode,
      councilSlug: job.councilSlug, startedAt: queryStarted, status: 'failed',
      httpStatus: outcome.httpStatus, attempts: e instanceof PlanItError ? e.attempts : 1,
      windowStart: window.startDate, windowEnd: window.endDate, windowDays: window.days,
      errorStage: 'fetch_submitted', error: e,
    })
    await logPipelineEvent(supabase, {
      runId, job: 'ingest', stage: 'fetch', severity: 'error', sourceKey: job.sourceKey,
      councilSlug: job.councilSlug, message: 'PlanIt fetch failed', error: e,
      retryCount: e instanceof PlanItError ? Math.max(e.attempts - 1, 0) : 0, recovered: false,
    })
    return outcome
  }

  let changed: PlanItQueryResult | null = null
  let changeError: unknown = null
  await new Promise((r) => setTimeout(r, CHANGE_PASS_DELAY_MS))
  try {
    changed = await queryPlanIt(where, { kind: 'changed', differentStart: changeWindow.differentStart }, { background: true })
  } catch (e) {
    changeError = e
    if (e instanceof PlanItError && e.httpStatus === 429) outcome.rateLimited = true
  }

  const sourceApps: IngestApplication[] = []
  const sourceFromSubmissionWindow = new Set<string>()
  const keys = new Set<string>()
  const appList: { council_slug: string; reference: string }[] = []
  for (const app of [...submitted.applications, ...(changed?.applications ?? [])]) {
    const council_slug = await resolver.resolve(app.councilName)
    const key = `${council_slug}|${app.reference}`
    if (keys.has(key)) continue
    keys.add(key)
    sourceApps.push(fromPlanIt(app, council_slug))
    appList.push({ council_slug, reference: app.reference })
  }
  for (const app of submitted.applications) {
    sourceFromSubmissionWindow.add(`${resolver.canonical(await resolver.resolve(app.councilName))}|${app.reference}`)
  }

  outcome.fetched = submitted.received
  outcome.changedSinceLastSync = changed?.received ?? null
  outcome.httpStatus = submitted.httpStatus

  const sourceRunId = await recordSourceRun(supabase, {
    runId, job: 'ingest', sourceKey: job.sourceKey, sourceLabel: job.sourceLabel ?? job.postcode,
    councilSlug: job.councilSlug, startedAt: queryStarted,
    status: changeError ? 'partial' : 'success',
    httpStatus: submitted.httpStatus, attempts: submitted.attempts + (changed?.attempts ?? 0),
    windowStart: window.startDate, windowEnd: window.endDate, windowDays: window.days,
    recordsReturned: submitted.received, sourceTotal: submitted.total,
    truncated: submitted.truncated || Boolean(changed?.truncated),
    changedRecords: changed?.received ?? null,
    errorStage: changeError ? 'fetch_changes' : null, error: changeError ?? undefined,
    recovered: window.mode === 'recovery',
  })

  if (changeError) {
    await logPipelineEvent(supabase, {
      runId, job: 'ingest', stage: 'fetch_changes', severity: 'warning', sourceKey: job.sourceKey,
      message: 'Status-change pass failed; submission window still ingested', error: changeError,
    })
  }
  if (submitted.truncated || changed?.truncated) {
    await logPipelineEvent(supabase, {
      runId, job: 'ingest', stage: 'fetch', severity: 'warning', sourceKey: job.sourceKey,
      message: `PlanIt reported more records than were retrieved (submitted ${submitted.received}/${submitted.total ?? '?'}, changed ${changed?.received ?? 0}/${changed?.total ?? '?'})`,
    })
  }
  if (window.mode === 'recovery') {
    await logPipelineEvent(supabase, {
      runId, job: 'ingest', stage: 'recovery', severity: window.capped ? 'warning' : 'info', sourceKey: job.sourceKey,
      message: window.reason, recovered: true,
    })
  }

  let result: Awaited<ReturnType<typeof upsertApplications>>
  try {
    result = await upsertApplications(supabase, sourceApps, { runId, job: 'ingest' })
  } catch (e) {
    outcome.error = String(e)
    await logPipelineEvent(supabase, {
      runId, job: 'ingest', stage: 'upsert', severity: 'critical', sourceKey: job.sourceKey,
      councilSlug: job.councilSlug,
      message: 'Source upsert failed; this source will be retried', error: e,
    })
    return outcome
  }

  // Per-source outcome counts are written immediately. A later timeout must
  // not leave already-processed sources looking unfinished.
  const newKeys = new Set(result.new_applications.map((a) => `${a.council_slug}|${a.reference}`))
  const writtenKeys = new Set(result.written_keys)
  let fresh = 0
  let updated = 0
  for (const key of keys) {
    if (newKeys.has(key)) fresh++
    else if (writtenKeys.has(key)) updated++
  }
  await updateSourceRunCounts(supabase, sourceRunId, {
    new_count: fresh,
    updated_count: updated,
    unchanged_count: keys.size - fresh - updated,
  })

  const announceable = result.new_applications.filter((a) =>
    sourceFromSubmissionWindow.has(`${a.council_slug}|${a.reference}`),
  )
  outcome.alertsSent = await sendBatchedAlerts(supabase, {
    queryKeyToAreas: new Map([[job.queryKey, job.areas]]),
    queryKeyToApps: new Map([[job.queryKey, appList]]),
    newApplications: announceable,
    siteUrl,
  })

  if (announceable.some((a) => a.application_type === 'discharge_of_condition')) {
    outcome.dischargeParentsResolved = await resolveDischargeParents(supabase)
    outcome.dischargeAlertsSent = await sendDischargeAlerts(supabase, {
      newApplications: announceable,
      staleRows: [],
      siteUrl,
    })
  }

  outcome.decisionsDetected = result.decided_applications.length
  outcome.decisionAlertsSent = await sendDecisionAlerts(supabase, {
    decided: result.decided_applications,
    siteUrl,
  })

  outcome.changed = result.changed
  outcome.unchanged = result.unchanged
  outcome.enriched = result.enriched
  outcome.newRefs = result.new_refs.length
  outcome.newAnnounced = announceable.length
  outcome.changesRecorded = result.changes_recorded
  outcome.duplicateCandidates = result.duplicate_candidates
  outcome.collapsedInBatch = result.collapsed_in_batch
  outcome.referenceVariantsResolved = result.reference_variants_resolved
  outcome.warnings = result.warnings
  outcome.status = changeError ? 'partial' : 'success'
  if (changeError) outcome.error = `change pass failed: ${String(changeError)}`

  // The stamp means "last successful sync", not merely "last successful
  // fetch", so it is written only once the source has actually been upserted.
  const areaIds = job.areas.map((a) => a.id)
  if (areaIds.length > 0) {
    await supabase
      .from('tracked_areas')
      .update({ last_planit_fetch_at: new Date().toISOString() })
      .eq('is_active', true)
      .in('id', areaIds)
  }

  return outcome
}
