// Analytics for what is actually in the user's territories.
//
// Two obvious reports are deliberately absent, because the data does not exist
// and an empty chart claiming to be insight is worse than an honest gap:
//
//   Approval rates — 2 of 307 applications carry a decision. Councils publish
//     outcomes slowly and inconsistently, and PlanIt reflects that. A rate
//     built on two data points is noise with a percentage sign on it.
//   Win rate / conversion — no lead has yet reached a won or lost stage. The
//     pipeline records it, so this becomes possible on its own once real
//     opportunities are worked through; it is a question of time, not plumbing.
//
// Everything below answers "where is the work and what kind is it", which is
// what a BD manager decides territory and staffing from — and every number is
// counted from rows we hold rather than estimated.

import { createClient } from '@/lib/supabase/server'
import { POSITIVE_GROUPS, POSITIVE_REASON_BY_ID, whereReason } from '@/lib/scoring/civilsCriteria'
import { APP_TYPES } from '@/lib/filters/opportunityFilters'

// The analytics page renders the most recent twelve weeks; anything older is
// counted in the totals but not bucketed, because a bar per week since the
// first ingest becomes unreadable long before it becomes more useful.
const WEEKS_SHOWN = 12

// Status keywords that indicate a council has actually decided something.
const DECISION_WORDS = ['approv', 'grant', 'permit', 'refus', 'reject'] as const

export interface Bucket {
  label: string
  count: number
}

export interface TerritoryStats {
  totalApplications: number
  scored: number
  /** Applications per ISO week, oldest first. */
  byWeek: Bucket[]
  byFit: Bucket[]
  byScope: Bucket[]
  byAuthority: Bucket[]
  byType: Bucket[]
  /** Null when nothing has been ingested yet. */
  earliest: string | null
  latest: string | null
  /** How many carry a decision — the reason approval rates are not shown. */
  withDecision: number
}

const FIT_LABEL: Record<string, string> = {
  HOT: 'Strong match',
  WARM: 'Worth reviewing',
  COLD: 'Low priority',
}

function titleCase(slug: string): string {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function toBuckets(m: Map<string, number>, limit?: number): Bucket[] {
  const out = [...m.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
  return limit ? out.slice(0, limit) : out
}

export async function getTerritoryStats(): Promise<TerritoryStats> {
  const supabase = await createClient()

  const empty: TerritoryStats = {
    totalApplications: 0, scored: 0, byWeek: [], byFit: [], byScope: [],
    byAuthority: [], byType: [], earliest: null, latest: null, withDecision: 0,
  }

  const { data: areas } = await supabase
    .from('tracked_areas')
    .select('council_slug')
    .eq('is_active', true)

  const slugs = [...new Set(((areas ?? []) as { council_slug: string }[]).map((a) => a.council_slug))]
  if (slugs.length === 0) return empty

  // Every figure below is a count(*) computed in the database.
  //
  // This used to select up to 5000 rows and tally them in TypeScript, with a
  // comment saying to revisit it if a user ever tracked enough authorities for
  // that to be thousands. That day arrived unannounced, and the failure was
  // silent: Supabase caps a result set at 1000 rows whatever limit is asked
  // for, so the page reported 1,000 applications against a real 2,743 — and
  // the weekly chart was drawn from an arbitrary truncated slice, making its
  // shape wrong rather than merely its scale. A chart that is wrong in shape is
  // worse than no chart, because you would act on it.
  //
  // Counting in SQL has no such ceiling and ships no rows. It costs more round
  // trips, which are parallel and indexed; if this page ever feels slow the
  // answer is one grouped RPC, not going back to tallying rows here.
  const scoped = () =>
    supabase
      .from('planning_applications')
      .select('*', { count: 'exact', head: true })
      .in('council_slug', slugs)

  const n = async (q: { count: number | null } | PromiseLike<{ count: number | null }>) =>
    (await q).count ?? 0

  // Only the weeks the page actually renders. Building a bucket for every week
  // since the first ingest would be dozens of queries for data nothing shows.
  const weekStarts: string[] = []
  {
    const cursor = new Date()
    cursor.setUTCHours(0, 0, 0, 0)
    cursor.setUTCDate(cursor.getUTCDate() - ((cursor.getUTCDay() + 6) % 7))
    for (let i = 0; i < WEEKS_SHOWN; i++) {
      weekStarts.unshift(cursor.toISOString().slice(0, 10))
      cursor.setUTCDate(cursor.getUTCDate() - 7)
    }
  }

  const [
    totalApplications,
    scored,
    withDecision,
    weekCounts,
    bandCounts,
    scopeCounts,
    authorityCounts,
    typeCounts,
    earliestRow,
    latestRow,
  ] = await Promise.all([
    n(scoped()),
    n(scoped().not('band', 'is', null)),
    // Same keyword set the previous version matched in JS.
    n(scoped().or(DECISION_WORDS.map((w) => `status.ilike.*${w}*`).join(','))),
    Promise.all(
      weekStarts.map(async (start) => {
        const end = new Date(`${start}T00:00:00Z`)
        end.setUTCDate(end.getUTCDate() + 7)
        return [start, await n(
          scoped().gte('application_date', start).lt('application_date', end.toISOString().slice(0, 10)),
        )] as const
      }),
    ),
    Promise.all(
      (['HOT', 'WARM', 'COLD'] as const).map(async (b) => [b, await n(scoped().eq('band', b))] as const),
    ),
    Promise.all(
      POSITIVE_GROUPS.map(async (g) => {
        const reason = POSITIVE_REASON_BY_ID.get(g.id)
        if (!reason) return [g.label, 0] as const
        return [g.label, await n(whereReason(scoped(), reason))] as const
      }),
    ),
    Promise.all(
      slugs.map(async (slug) => [titleCase(slug), await n(scoped().eq('council_slug', slug))] as const),
    ),
    Promise.all(
      APP_TYPES.map(async (t) => [t, await n(scoped().eq('raw_data->>app_type', t))] as const),
    ),
    supabase.from('planning_applications').select('application_date')
      .in('council_slug', slugs).not('application_date', 'is', null)
      .order('application_date', { ascending: true }).limit(1).maybeSingle(),
    supabase.from('planning_applications').select('application_date')
      .in('council_slug', slugs).not('application_date', 'is', null)
      .order('application_date', { ascending: false }).limit(1).maybeSingle(),
  ])

  if (totalApplications === 0) return empty

  const byFitMap = new Map<string, number>(
    bandCounts.map(([b, c]) => [FIT_LABEL[b] ?? b, c]),
  )
  byFitMap.set('Not scored', totalApplications - scored)

  // Whatever the eight known PlanIt types do not account for. Named rather than
  // dropped, so the bars still sum to the total the page headlines.
  const typed = typeCounts.reduce((sum, [, c]) => sum + c, 0)
  const otherTypes = totalApplications - typed

  return {
    totalApplications,
    scored,
    byWeek: weekCounts.map(([label, count]) => ({ label, count })),
    // Fixed order, not by size: these are a scale, and a bar chart that
    // reorders itself as the data shifts is harder to read week to week.
    byFit: ['Strong match', 'Worth reviewing', 'Low priority', 'Not scored']
      .map((label) => ({ label, count: byFitMap.get(label) ?? 0 }))
      .filter((b) => b.count > 0),
    byScope: toBuckets(
      new Map(scopeCounts.filter(([, c]) => c > 0).map(([label, c]) => [label.replace(/ scope$| works$/, ''), c])),
    ),
    byAuthority: toBuckets(new Map(authorityCounts.filter(([, c]) => c > 0))),
    byType: toBuckets(
      new Map<string, number>([
        ...typeCounts.filter(([, c]) => c > 0),
        ...(otherTypes > 0 ? ([['Unclassified', otherTypes]] as [string, number][]) : []),
      ]),
      8,
    ),
    earliest: (earliestRow.data?.application_date as string) ?? null,
    latest: (latestRow.data?.application_date as string) ?? null,
    withDecision,
  }
}
