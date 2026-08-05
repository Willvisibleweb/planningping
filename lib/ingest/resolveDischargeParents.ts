// Best-effort resolution of parent_application_reference (raw parsed text)
// into parent_application_id (a real FK). Run every cron tick, not just at
// insert time — a discharge application's parent is frequently ingested
// AFTER the discharge row itself (different tracked-area radius/timing,
// backfill order, or the parent predates our tracking window entirely).
// A one-shot attempt at insert time would permanently miss late arrivals.
//
// Scoped to the discharge row's own council_slug — a discharge application
// is always submitted to the same LPA as its parent permission, so this
// reuses the existing (council_slug, reference) unique index with no new
// index needed, and avoids false-positive cross-council collisions on bare
// numeric references (e.g. "243167") that aren't distinctive enough to
// safely match globally.

import type { createAdminClient } from '@/lib/supabase/admin'

type AdminClient = ReturnType<typeof createAdminClient>

const BATCH_LIMIT = 500 // discharge rows are a minority of ingested applications —
// bounded batch is plenty; catches up over subsequent days if ever exceeded.

export async function resolveDischargeParents(supabase: AdminClient): Promise<number> {
  const { data: unresolved } = await supabase
    .from('planning_applications')
    .select('id, council_slug, parent_application_reference')
    .eq('application_type', 'discharge_of_condition')
    .is('parent_application_id', null)
    .not('parent_application_reference', 'is', null)
    .limit(BATCH_LIMIT)

  let resolved = 0
  for (const row of (unresolved ?? []) as {
    id: string
    council_slug: string
    parent_application_reference: string
  }[]) {
    // Exact case-insensitive match (no wildcards) — we want the real
    // reference, not a fuzzy/partial one.
    const { data: matches } = await supabase
      .from('planning_applications')
      .select('id')
      .eq('council_slug', row.council_slug)
      .ilike('reference', row.parent_application_reference)
      .limit(2)

    // Only resolve on an unambiguous single match — anything else (0 or 2+)
    // stays null for a future run rather than guessing wrong.
    if (matches?.length === 1) {
      await supabase
        .from('planning_applications')
        .update({ parent_application_id: matches[0].id })
        .eq('id', row.id)
      resolved++
    }
  }
  return resolved
}
