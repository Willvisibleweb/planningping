// Flags discharge-of-condition applications with no decision after N weeks
// (default 8, configurable via DISCHARGE_STALE_WEEKS) as stale. Two-way: a
// row that later gets a decision_date is automatically un-flagged, so the
// flag always reflects current reality rather than being a one-way marker.
// Run every cron tick — the only live daily schedule.

import type { createAdminClient } from '@/lib/supabase/admin'

type AdminClient = ReturnType<typeof createAdminClient>

export interface StaleDischargeRow {
  id: string
  parent_application_id: string | null
  council_slug: string
  reference: string
  description: string | null
  address: string | null
  application_date: string | null
}

const BATCH_LIMIT = 500

export async function flagStaleDischarges(
  supabase: AdminClient,
  staleWeeks = Number(process.env.DISCHARGE_STALE_WEEKS) || 8,
): Promise<StaleDischargeRow[]> {
  const cutoff = new Date(Date.now() - staleWeeks * 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  // Clear the flag on anything that's since received a decision.
  await supabase
    .from('planning_applications')
    .update({ is_stale: false })
    .eq('application_type', 'discharge_of_condition')
    .eq('is_stale', true)
    .not('decision_date', 'is', null)

  const { data: newlyStale } = await supabase
    .from('planning_applications')
    .select('id, parent_application_id, council_slug, reference, description, address, application_date')
    .eq('application_type', 'discharge_of_condition')
    .eq('is_stale', false)
    .is('decision_date', null)
    .not('application_date', 'is', null)
    .lte('application_date', cutoff)
    .limit(BATCH_LIMIT)

  const rows = (newlyStale ?? []) as StaleDischargeRow[]
  if (rows.length > 0) {
    await supabase
      .from('planning_applications')
      .update({ is_stale: true })
      .in('id', rows.map((r) => r.id))
  }
  return rows
}
