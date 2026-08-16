'use server'

// Searching every application in a territory, rather than the page's first 200.
//
// The list on the territory page is capped at 200 rows, newest first, because
// rendering the lot would be wasteful. Filtering that array in the browser —
// what the search box used to do — quietly inherited the cap: Westminster holds
// 742 applications, so 542 of them could not be found by searching, and nothing
// on screen said so. Searching server-side removes the cap from the question.
//
// Scoping is by RLS, not by this code: planning_applications may only be read
// for councils the caller actively tracks, so a forged areaId cannot widen the
// search. The area lookup below is scoped to the caller for the same reason.

import { createClient } from '@/lib/supabase/server'
import { lookupPostcode, distanceKm } from '@/lib/postcodes'
import { buildTsQuery, looksLikeReference } from '@/lib/search/vocabulary'
import type { PlanningApplication, TrackedArea } from '@/types/database'

export interface SearchableApplication {
  app: PlanningApplication
  distanceKm: number | null
  isTracked: boolean
}

export interface SearchResult {
  items: SearchableApplication[]
  /** Total matches found, before the display cap below. */
  total: number
  /** True when results were trimmed, so the UI can say so honestly. */
  truncated: boolean
}

// Enough that a real search is never silently cut short, small enough that one
// broad term ("house") can't ship the whole council to the browser.
const RESULT_CAP = 300

export async function searchTerritory(
  areaId: string,
  query: string,
): Promise<SearchResult | { error: string }> {
  const trimmed = query.trim()
  if (!trimmed) return { items: [], total: 0, truncated: false }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const { data: areaRow } = await supabase
    .from('tracked_areas')
    .select('*')
    .eq('id', areaId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!areaRow) return { error: 'Could not find that territory.' }
  const area = areaRow as TrackedArea

  function scoped() {
    let q = supabase
      .from('planning_applications')
      .select('*')
      .eq('council_slug', area.council_slug)
    // Same band preference the list and the alert cron honour — search must not
    // surface applications the user has chosen not to be shown.
    if (area.min_band === 'WARM_PLUS') q = q.in('band', ['HOT', 'WARM'])
    else if (area.min_band === 'HOT_ONLY') q = q.eq('band', 'HOT')
    return q
  }

  // Three paths, because only the description is worth searching loosely.
  //
  // Synonyms and stemming belong to the description — they describe what is
  // being built. Applied to addresses they are actively harmful: "road" stems
  // together with "roads" and appears in most addresses, so widening a search
  // for highways across addresses matched 41% of the entire table. Addresses
  // and references are therefore matched literally, exactly as typed.
  const tsQuery = buildTsQuery(trimmed)
  const wantsReference = looksLikeReference(trimmed)

  const [textMatches, addressMatches, referenceMatches] = await Promise.all([
    tsQuery
      ? scoped()
          .textSearch('search_vector', tsQuery, { config: 'english' })
          .limit(RESULT_CAP + 1)
      : Promise.resolve({ data: [] as PlanningApplication[] }),
    scoped().ilike('address', `%${trimmed}%`).limit(RESULT_CAP),
    wantsReference
      ? scoped().ilike('reference', `%${trimmed}%`).limit(50)
      : Promise.resolve({ data: [] as PlanningApplication[] }),
  ])

  // Reference hits first: if someone pasted a reference, that exact application
  // is the answer, not the best-scoring text match. Address next, since typing
  // a street is a precise request in a way a keyword isn't.
  const merged: PlanningApplication[] = []
  const seen = new Set<string>()
  for (const app of [
    ...((referenceMatches.data ?? []) as PlanningApplication[]),
    ...((addressMatches.data ?? []) as PlanningApplication[]),
    ...((textMatches.data ?? []) as PlanningApplication[]),
  ]) {
    if (seen.has(app.id)) continue
    seen.add(app.id)
    merged.push(app)
  }

  const truncated = merged.length > RESULT_CAP
  const capped = merged.slice(0, RESULT_CAP)

  const [geo, { data: leads }] = await Promise.all([
    lookupPostcode(area.postcode),
    supabase.from('tracked_leads').select('application_id'),
  ])
  const trackedIds = new Set((leads ?? []).map((l) => l.application_id as string))

  const items: SearchableApplication[] = capped.map((app) => {
    const raw = app.raw_data as { lat?: unknown; lng?: unknown } | null
    const lat = typeof raw?.lat === 'number' ? raw.lat : null
    const lng = typeof raw?.lng === 'number' ? raw.lng : null
    return {
      app,
      distanceKm: geo && lat !== null && lng !== null ? distanceKm(geo.lat, geo.lng, lat, lng) : null,
      isTracked: trackedIds.has(app.id),
    }
  })

  // Nearest first, matching the unsearched list's order — a result set that
  // reorders itself the moment you type reads as a different list entirely.
  items.sort((a, b) => {
    if (a.distanceKm === null && b.distanceKm === null) return 0
    if (a.distanceKm === null) return 1
    if (b.distanceKm === null) return -1
    return a.distanceKm - b.distanceKm
  })

  return { items, total: merged.length, truncated }
}
