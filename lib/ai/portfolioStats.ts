// Exact counts for the assistants' summary tools.
//
// The obvious implementation — select the rows, tally them in JS — is wrong
// here, and wrong in a way that reads as a confident answer. Supabase caps a
// result set at 1000 rows regardless of the .limit() asked for, so a tally over
// "every row" silently becomes a tally over an arbitrary first thousand. A
// portfolio of 2,698 applications across seven councils reported 1,000 across
// three, with the other four missing entirely; a `capped` flag testing
// rows.length === 2000 could never fire, because 2000 rows never arrive.
//
// So nothing is counted in JS. Every number here is a count(*) computed in the
// database, which has no such ceiling and does not have to ship rows to reach
// an answer. More round trips, all parallel, all indexed — and correct.

import { POSITIVE_GROUPS, POSITIVE_REASON_BY_ID, whereReason } from '@/lib/scoring/civilsCriteria'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface PortfolioStats {
  total: number
  byCouncil: Record<string, number>
  byFit: Record<string, number>
  topTrades: Record<string, number>
  oldest: string | null
  newest: string | null
}

/**
 * Counts across a set of councils. Pass one slug for a single territory.
 *
 * Runs through whichever client is given, so the caller's RLS still applies —
 * these are counts of what that user is allowed to see.
 */
export async function getPortfolioStats(
  supabase: SupabaseClient,
  councilSlugs: string[],
): Promise<PortfolioStats> {
  const scoped = () =>
    supabase
      .from('planning_applications')
      .select('*', { count: 'exact', head: true })
      .in('council_slug', councilSlugs)

  const bands = ['HOT', 'WARM', 'COLD'] as const

  const [total, councilCounts, bandCounts, tradeCounts, oldestRow, newestRow] = await Promise.all([
    scoped(),
    Promise.all(councilSlugs.map(async (slug) => [slug, (await scoped().eq('council_slug', slug)).count ?? 0] as const)),
    Promise.all(bands.map(async (b) => [b, (await scoped().eq('band', b)).count ?? 0] as const)),
    Promise.all(
      POSITIVE_GROUPS.map(async (g) => {
        const reason = POSITIVE_REASON_BY_ID.get(g.id)
        if (!reason) return [g.label, 0] as const
        // whereReason, not .contains(col, [str]): score_reasons is jsonb and a
        // JS array serialises to array-literal syntax the database rejects.
        return [g.label, (await whereReason(scoped(), reason)).count ?? 0] as const
      }),
    ),
    supabase.from('planning_applications').select('application_date')
      .in('council_slug', councilSlugs).not('application_date', 'is', null)
      .order('application_date', { ascending: true }).limit(1).maybeSingle(),
    supabase.from('planning_applications').select('application_date')
      .in('council_slug', councilSlugs).not('application_date', 'is', null)
      .order('application_date', { ascending: false }).limit(1).maybeSingle(),
  ])

  return {
    total: total.count ?? 0,
    byCouncil: Object.fromEntries(councilCounts.filter(([, n]) => n > 0)),
    byFit: Object.fromEntries(bandCounts.filter(([, n]) => n > 0)),
    topTrades: Object.fromEntries(
      tradeCounts.filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]),
    ),
    oldest: (oldestRow.data?.application_date as string) ?? null,
    newest: (newestRow.data?.application_date as string) ?? null,
  }
}
