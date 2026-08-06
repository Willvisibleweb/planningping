// Shared upsert for ingested applications. Used by the PlanIt cron ingest (and
// available to any future source). Mirrors the webhook's dedup model, and ALSO
// scores each new/changed row inline — so Leads is populated automatically
// instead of relying on a manual /api/score run.

import { createHash } from 'crypto'
import { scoreApplication } from '@/lib/scoring/scoreApplication'
import { classifyApplication } from '@/lib/classification/classifyApplication'
import { classifyDecision, isDecided, type DecisionOutcome } from '@/lib/classification/decisionOutcome'
import type { createAdminClient } from '@/lib/supabase/admin'

type AdminClient = ReturnType<typeof createAdminClient>

export interface IngestApplication {
  council_slug: string
  reference: string
  address: string | null
  description: string | null
  status: string | null
  application_date: string | null
  decision_date: string | null
  raw_data: Record<string, unknown> | null
}

// Richer than new_refs — the alert fan-out (app/api/cron/ingest/route.ts)
// needs enough of the row to filter by band and build an email without a
// second round-trip to the DB. id is attached after the upsert (see below) —
// the discharge alert path needs it to query children/parents by id.
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
  changed: number
  new_refs: string[]
  new_applications: NewApplication[]
  decided_applications: DecidedApplication[]
}

// Only status + decision_date drive a "meaningful change" (matches the webhook).
function stateHash(status: string | null, decisionDate: string | null): string {
  return createHash('sha256').update(`${status ?? ''}|${decisionDate ?? ''}`).digest('hex')
}

export async function upsertApplications(
  supabase: AdminClient,
  apps: IngestApplication[],
): Promise<UpsertResult> {
  // Group by council so we can fetch existing hashes once per council.
  const byCouncil = new Map<string, IngestApplication[]>()
  for (const a of apps) {
    if (!a.reference || !a.council_slug) continue
    const list = byCouncil.get(a.council_slug) ?? []
    list.push(a)
    byCouncil.set(a.council_slug, list)
  }

  const rows: Record<string, unknown>[] = []
  const new_refs: string[] = []
  const new_applications: NewApplication[] = []
  const decided_applications: DecidedApplication[] = []

  for (const [council, list] of byCouncil) {
    // status comes back alongside the hash so a decision can be detected as a
    // transition. The hash alone says "something changed", not what it changed
    // from — and "was it already approved" is the entire question.
    const { data: existing } = await supabase
      .from('planning_applications')
      .select('reference, state_hash, status, decision_alerted_at')
      .eq('council_slug', council)

    const existingHash: Record<string, string> = {}
    const previousStatus: Record<string, string | null> = {}
    const alreadyAlerted: Record<string, boolean> = {}
    for (const e of (existing ?? []) as {
      reference: string
      state_hash: string | null
      status: string | null
      decision_alerted_at: string | null
    }[]) {
      existingHash[e.reference] = e.state_hash ?? ''
      previousStatus[e.reference] = e.status
      alreadyAlerted[e.reference] = e.decision_alerted_at !== null
    }

    // De-dupe references within this batch (radius queries can repeat).
    const seen = new Set<string>()
    for (const a of list) {
      if (seen.has(a.reference)) continue
      seen.add(a.reference)

      const hash = stateHash(a.status, a.decision_date)
      if (existingHash[a.reference] === hash) continue // unchanged — skip

      const isNew = !(a.reference in existingHash)
      const { score, band, matchedReasons } = scoreApplication({
        reference: a.reference,
        description: a.description,
        address: a.address,
      })
      const appType = (a.raw_data as { app_type?: unknown } | null)?.app_type
      const { applicationType, parentReferenceRaw, needsReview } = classifyApplication({
        description: a.description,
        appType: typeof appType === 'string' ? appType : null,
      })

      rows.push({
        council_slug: a.council_slug,
        reference: a.reference,
        address: a.address,
        description: a.description,
        status: a.status,
        application_date: a.application_date,
        decision_date: a.decision_date,
        state_hash: hash,
        raw_data: a.raw_data,
        last_scraped_at: new Date().toISOString(),
        score,
        band,
        score_reasons: matchedReasons,
        application_type: applicationType,
        parent_application_reference: parentReferenceRaw,
        parent_reference_needs_review: needsReview,
      })
      // Decision detection. Four guards, all necessary:
      //   !isNew            — a brand-new row arriving already decided is
      //                       history we never saw undecided, not news.
      //   !alreadyAlerted   — at-most-once, even if a council rewrites the
      //                       status text again later.
      //   !wasDecided       — the transition, not the state. Without this,
      //                       any reword of an approved status re-alerts.
      //   outcome           — it actually reads as a decision now.
      const outcome = classifyDecision(a.status)
      const wasDecided = isDecided(previousStatus[a.reference] ?? null)
      if (!isNew && !alreadyAlerted[a.reference] && !wasDecided && outcome) {
        decided_applications.push({
          id: null, // attached below, once the upsert returns real ids
          council_slug: a.council_slug,
          reference: a.reference,
          description: a.description,
          address: a.address,
          status: a.status,
          decision_date: a.decision_date,
          outcome,
          band,
        })
      }

      if (isNew) {
        new_refs.push(a.reference)
        new_applications.push({
          id: null, // attached below, once the upsert returns real ids
          council_slug: a.council_slug,
          reference: a.reference,
          description: a.description,
          address: a.address,
          application_date: a.application_date,
          band,
          application_type: applicationType,
          parent_application_reference: parentReferenceRaw,
        })
      }
    }
  }

  if (rows.length > 0) {
    const { data: upserted, error } = await supabase
      .from('planning_applications')
      .upsert(rows, { onConflict: 'council_slug,reference', ignoreDuplicates: false })
      .select('id, council_slug, reference')
    if (error) throw new Error(`upsert failed: ${error.message}`)

    // Attach real ids to the new-application list — same round trip, no
    // extra query. The discharge alert path needs these to look up
    // children/parents by id.
    const idByKey = new Map(
      ((upserted ?? []) as { id: string; council_slug: string; reference: string }[]).map((r) => [
        `${r.council_slug}|${r.reference}`,
        r.id,
      ]),
    )
    for (const na of new_applications) {
      na.id = idByKey.get(`${na.council_slug}|${na.reference}`) ?? null
    }
    for (const da of decided_applications) {
      da.id = idByKey.get(`${da.council_slug}|${da.reference}`) ?? null
    }
  }

  return {
    received: apps.length,
    changed: rows.length,
    new_refs,
    new_applications,
    decided_applications,
  }
}
