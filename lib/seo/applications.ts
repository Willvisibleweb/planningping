// Application data + computed stats for the location pages. Reads only the
// scoped public_applications view (safe columns) and the open councils table,
// via the existing admin client (build-time / ISR safe).

import { createAdminClient } from '@/lib/supabase/admin'
import type { SeoLocation } from '@/lib/seo/locations'

export interface PublicApplication {
  id: string
  council_slug: string
  reference: string
  address: string | null
  description: string | null
  status: string | null
  application_date: string | null
  decision_date: string | null
  postcode_district: string | null
}

// Pull the location's applications (capped) newest-first. One fetch serves both
// the "20 most recent" list and the 30-day summary stats.
export async function getLocationApplications(location: SeoLocation): Promise<PublicApplication[]> {
  const supabase = createAdminClient()
  let query = supabase
    .from('public_applications')
    .select(
      'id, council_slug, reference, address, description, status, application_date, decision_date, postcode_district',
    )
    .order('application_date', { ascending: false, nullsFirst: false })
    .limit(500)

  if (location.tier === 'council') {
    query = query.eq('council_slug', location.slug)
  } else if (location.tier === 'postcode') {
    query = query.eq('postcode_district', location.slug.toUpperCase())
  } else {
    // town: scoped to its council, matched on the comma-delimited component
    query = query
      .eq('council_slug', location.parent_slug ?? '')
      .ilike('address', `%, ${location.name}, %`)
  }

  const { data, error } = await query
  if (error) throw new Error(`applications query failed (${location.tier}/${location.slug}): ${error.message}`)
  return (data ?? []) as PublicApplication[]
}

// slug -> portal base URL, for outbound "view on the council portal" links.
export async function getCouncilPortalMap(): Promise<Record<string, string>> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.from('councils').select('slug, portal_url')
  if (error) throw new Error(`councils query failed: ${error.message}`)
  const map: Record<string, string> = {}
  for (const row of (data ?? []) as { slug: string; portal_url: string }[]) {
    map[row.slug] = row.portal_url
  }
  return map
}

// We have no per-application keyVal (raw_data is empty), so we can't deep-link a
// specific application. Link to the council's Idox simple-search page instead,
// where the visitor can paste the reference shown on the card.
export function portalSearchUrl(portalUrl: string | undefined): string | null {
  if (!portalUrl) return null
  const base = portalUrl.replace(/\/+$/, '').replace(/\/search\.do.*$/i, '')
  return `${base}/search.do?action=simple&searchType=Application`
}

// ---- Summary stats, computed from the real rows ----------------------------

export interface LocationStats {
  totalCount: number
  last30Count: number
  approved: number
  refused: number
  topCategory: { label: string; count: number } | null
}

// Deterministic category from the description. Labels are plain-English so the
// generated summary reads naturally. First matching rule wins.
export function categorise(description: string | null): string {
  const s = (description ?? '').toLowerCase()
  if (!s) return 'other works'
  if (/\b(fell|prune|crown|lop|pollard)\b|\btree\b|\btrees\b|tpo/.test(s)) return 'tree works'
  if (/listed building|\blbc\b/.test(s)) return 'listed building works'
  if (/change of use/.test(s)) return 'changes of use'
  if (/\bloft\b|dormer/.test(s)) return 'loft conversions'
  if (/extension|extend/.test(s)) return 'extensions'
  if (/advertisement|signage|fascia|\bsign\b/.test(s)) return 'advertisements'
  if (/demolition|demolish/.test(s)) return 'demolitions'
  if (/erection of|new dwelling|new build|construction of/.test(s)) return 'new builds'
  if (/certificate of lawful|lawful development/.test(s)) return 'lawful-development certificates'
  if (/discharge of|reserved by condition|condition no/.test(s)) return 'condition discharges'
  return 'other works'
}

function isApproved(status: string | null): boolean {
  return /approv|grant|permit/i.test(status ?? '')
}
function isRefused(status: string | null): boolean {
  return /refus|reject|withdraw|dismiss/i.test(status ?? '')
}

export function computeStats(apps: PublicApplication[]): LocationStats {
  const cutoff = new Date()
  cutoff.setUTCDate(cutoff.getUTCDate() - 30)
  const cutoffIso = cutoff.toISOString().slice(0, 10)

  const recent = apps.filter((a) => a.application_date != null && a.application_date >= cutoffIso)

  const catCounts = new Map<string, number>()
  for (const a of recent) {
    const c = categorise(a.description)
    if (c === 'other works') continue // don't surface the catch-all as "most common"
    catCounts.set(c, (catCounts.get(c) ?? 0) + 1)
  }
  let topCategory: { label: string; count: number } | null = null
  for (const [label, count] of catCounts) {
    if (!topCategory || count > topCategory.count) topCategory = { label, count }
  }

  return {
    totalCount: apps.length,
    last30Count: recent.length,
    approved: recent.filter((a) => isApproved(a.status)).length,
    refused: recent.filter((a) => isRefused(a.status)).length,
    topCategory,
  }
}

// The generated summary paragraph — real numbers only, phrased per location.
// `placePhrase` reads naturally in a sentence ("Leek", "the ST13 postcode area").
export function buildSummary(placePhrase: string, stats: LocationStats): string {
  if (stats.last30Count === 0) {
    const n = stats.totalCount
    return `No new planning applications were recorded in ${placePhrase} in the last 30 days. Below ${n === 1 ? 'is the most recent application' : `are the ${Math.min(n, 20)} most recent applications`} from the register.`
  }

  const n = stats.last30Count
  let out = `${n} planning application${n === 1 ? ' was' : 's were'} submitted in ${placePhrase} in the last 30 days.`

  if (stats.topCategory && stats.topCategory.count >= 2) {
    out += ` The most common type was ${stats.topCategory.label} (${stats.topCategory.count}).`
  }

  if (stats.approved > 0 || stats.refused > 0) {
    const parts: string[] = []
    if (stats.approved > 0) parts.push(`${stats.approved} ${stats.approved === 1 ? 'was' : 'were'} approved`)
    if (stats.refused > 0) parts.push(`${stats.refused} refused`)
    out += ` ${parts.join(' and ')} in this period.`
  }

  return out
}
