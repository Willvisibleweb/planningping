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
import { POSITIVE_GROUPS } from '@/lib/scoring/civilsCriteria'

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

interface Row {
  council_slug: string
  band: string | null
  application_date: string | null
  status: string | null
  score_reasons: string[] | null
  raw_data: { app_type?: unknown } | null
}

const FIT_LABEL: Record<string, string> = {
  HOT: 'Strong match',
  WARM: 'Worth reviewing',
  COLD: 'Low priority',
}

function titleCase(slug: string): string {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

// Monday of the week a date falls in, so weeks group consistently regardless of
// which day the application landed.
function weekStart(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  const day = (d.getUTCDay() + 6) % 7 // Monday = 0
  d.setUTCDate(d.getUTCDate() - day)
  return d.toISOString().slice(0, 10)
}

function tally(pairs: string[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const p of pairs) m.set(p, (m.get(p) ?? 0) + 1)
  return m
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

  // Aggregated in TypeScript rather than SQL because the scoped set is a few
  // hundred rows, and one round trip beats six. Revisit if a user ever tracks
  // enough authorities for this to be thousands.
  const { data } = await supabase
    .from('planning_applications')
    .select('council_slug, band, application_date, status, score_reasons, raw_data')
    .in('council_slug', slugs)
    .limit(5000)

  const rows = (data ?? []) as Row[]
  if (rows.length === 0) return empty

  const dates = rows.map((r) => r.application_date).filter(Boolean).sort() as string[]

  // Weeks are built from a continuous range rather than only weeks that have
  // data, so a quiet week reads as a genuine trough instead of vanishing and
  // making the line look busier than it was.
  const weekCounts = tally(dates.map(weekStart))
  const byWeek: Bucket[] = []
  if (dates.length > 0) {
    const cursor = new Date(`${weekStart(dates[0])}T00:00:00Z`)
    const end = new Date(`${weekStart(dates[dates.length - 1])}T00:00:00Z`)
    while (cursor <= end) {
      const key = cursor.toISOString().slice(0, 10)
      byWeek.push({ label: key, count: weekCounts.get(key) ?? 0 })
      cursor.setUTCDate(cursor.getUTCDate() + 7)
    }
  }

  // Scope counts come from the scorer's own reason strings, matched on the
  // group's label rather than a copy of it, so renaming a group here cannot
  // silently produce a category that never matches.
  const scopeCounts = new Map<string, number>()
  for (const g of POSITIVE_GROUPS) {
    const needle = `${g.label} (+${g.weight})`
    const n = rows.filter((r) => (r.score_reasons ?? []).includes(needle)).length
    if (n > 0) scopeCounts.set(g.label.replace(/ scope$| works$/, ''), n)
  }

  const fitCounts = tally(
    rows.map((r) => (r.band ? FIT_LABEL[r.band] ?? r.band : 'Not scored')),
  )

  return {
    totalApplications: rows.length,
    scored: rows.filter((r) => r.band).length,
    byWeek,
    // Fixed order, not by size: these are a scale, and a bar chart that
    // reorders itself as the data shifts is harder to read week to week.
    byFit: ['Strong match', 'Worth reviewing', 'Low priority', 'Not scored']
      .map((label) => ({ label, count: fitCounts.get(label) ?? 0 }))
      .filter((b) => b.count > 0),
    byScope: toBuckets(scopeCounts),
    byAuthority: toBuckets(tally(rows.map((r) => titleCase(r.council_slug)))),
    byType: toBuckets(
      tally(rows.map((r) => (typeof r.raw_data?.app_type === 'string' ? r.raw_data.app_type : 'Unclassified'))),
      8,
    ),
    earliest: dates[0] ?? null,
    latest: dates[dates.length - 1] ?? null,
    withDecision: rows.filter((r) => /approv|grant|permit|refus|reject/i.test(r.status ?? '')).length,
  }
}
