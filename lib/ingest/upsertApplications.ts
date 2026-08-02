// Shared upsert for ingested applications. Used by the PlanIt cron ingest (and
// available to any future source). Mirrors the webhook's dedup model, and ALSO
// scores each new/changed row inline — so Leads is populated automatically
// instead of relying on a manual /api/score run.

import { createHash } from 'crypto'
import { scoreApplication } from '@/lib/scoring/scoreApplication'
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
// second round-trip to the DB.
export interface NewApplication {
  council_slug: string
  reference: string
  description: string | null
  address: string | null
  application_date: string | null
  band: string | null
}

export interface UpsertResult {
  received: number
  changed: number
  new_refs: string[]
  new_applications: NewApplication[]
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

  for (const [council, list] of byCouncil) {
    const { data: existing } = await supabase
      .from('planning_applications')
      .select('reference, state_hash')
      .eq('council_slug', council)

    const existingHash: Record<string, string> = {}
    for (const e of (existing ?? []) as { reference: string; state_hash: string | null }[]) {
      existingHash[e.reference] = e.state_hash ?? ''
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
      })
      if (isNew) {
        new_refs.push(a.reference)
        new_applications.push({
          council_slug: a.council_slug,
          reference: a.reference,
          description: a.description,
          address: a.address,
          application_date: a.application_date,
          band,
        })
      }
    }
  }

  if (rows.length > 0) {
    const { error } = await supabase
      .from('planning_applications')
      .upsert(rows, { onConflict: 'council_slug,reference', ignoreDuplicates: false })
    if (error) throw new Error(`upsert failed: ${error.message}`)
  }

  return { received: apps.length, changed: rows.length, new_refs, new_applications }
}
