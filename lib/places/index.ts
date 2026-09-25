// Place-name search, and turning a chosen place into the postcode the rest of
// PlanningPing runs on.
//
// Everything downstream — tracked areas, the PlanIt fetch, radius, alerts, the
// location pages — is keyed on a postcode. Rather than teach all of that about
// towns, a place is converted once, at the edge, into the postcode nearest its
// centre. The same approach "Use my location" in onboarding already takes with
// the browser's coordinates.
//
// Ranking and matching live in rankPlaces.ts, which has no network calls and
// is tested directly.

import {
  fallbackQueries,
  isUnambiguous,
  rankPlaces,
  splitQualifier,
  type PlaceSuggestion,
  type RawPlace,
} from './rankPlaces'

export type { PlaceSuggestion } from './rankPlaces'
export { looksLikePostcode } from './rankPlaces'

// postcodes.io usually answers in well under a second, but a /places query has
// been seen to hang indefinitely. Suggestions are typed-ahead, so a slow one is
// worse than none.
const TIMEOUT_MS = 4000

async function fetchPlaces(q: string): Promise<RawPlace[]> {
  try {
    const res = await fetch(
      `https://api.postcodes.io/places?q=${encodeURIComponent(q)}&limit=30`,
      {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        // Place names do not move. A day's cache means the second person to
        // type "liv" never leaves our server.
        next: { revalidate: 86_400 },
      },
    )
    if (!res.ok) return []
    const json = await res.json()
    return Array.isArray(json?.result) ? (json.result as RawPlace[]) : []
  } catch {
    return []
  }
}

/**
 * Suggestions for what someone has typed so far.
 *
 * Tries the text as typed, then — only if that finds nothing — up to two
 * shorter versions, so a typo still lands on the right place.
 */
export async function searchPlaces(input: string, limit = 6): Promise<PlaceSuggestion[]> {
  const { name, qualifier } = splitQualifier(input.trim())
  if (name.length < 2 || name.length > 60) return []

  const direct = await fetchPlaces(name)
  if (direct.length) return rankPlaces(direct, { query: name, qualifier, limit })

  for (const shorter of fallbackQueries(name)) {
    const broad = await fetchPlaces(shorter)
    const ranked = rankPlaces(broad, { query: name, qualifier, fuzzy: true, limit })
    if (ranked.length) return ranked
  }
  return []
}

export type ResolvedPlace =
  | { ok: true; place: PlaceSuggestion }
  | { ok: false; reason: 'not-found' | 'ambiguous'; suggestions: PlaceSuggestion[] }

/**
 * Resolve free text to one place without a person choosing from a list — for
 * a form submitted by pressing Enter. Refuses to guess between equally good
 * answers, and hands them back so the caller can ask.
 */
export async function resolvePlace(input: string): Promise<ResolvedPlace> {
  const suggestions = await searchPlaces(input)
  if (suggestions.length === 0) return { ok: false, reason: 'not-found', suggestions }
  if (!isUnambiguous(suggestions, input)) return { ok: false, reason: 'ambiguous', suggestions }
  return { ok: true, place: suggestions[0] }
}

/**
 * The postcode nearest a point, or null if there is none within 2km.
 *
 * 2km is postcodes.io's maximum. A town centre always has one far closer; the
 * limit only matters for a moor or a lake, where "no postcode near here" is
 * the honest answer.
 */
export async function nearestPostcode(lat: number, lng: number): Promise<string | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 49 || lat > 61 || lng < -9 || lng > 2) {
    return null
  }
  try {
    const res = await fetch(
      `https://api.postcodes.io/postcodes?lon=${lng}&lat=${lat}&limit=1&radius=2000`,
      { signal: AbortSignal.timeout(8000) },
    )
    if (!res.ok) return null
    const json = await res.json()
    return (json?.result?.[0]?.postcode as string | undefined) ?? null
  } catch {
    return null
  }
}

/** "There are several places called Alton — Alton (East Hampshire), …" */
export function describeChoices(suggestions: PlaceSuggestion[]): string {
  return suggestions
    .slice(0, 3)
    .map((s) => (s.context ? `${s.name} (${s.context})` : s.name))
    .join(', ')
}
