'use server'

// Server-action wrapper around searchArea.
//
// Kept apart from the implementation so the search logic stays importable from
// server components (the homepage renders a default view without a round trip)
// while the client form can still call it on submit.

import { searchArea, type AreaSearchResult } from './areaSearch'
import { looksLikePostcode, searchPlaces, type PlaceSuggestion } from '@/lib/places'

export async function searchAreaAction(
  query: string,
  scopeId?: string,
  place?: PlaceSuggestion | null,
): Promise<AreaSearchResult> {
  return searchArea(query, scopeId, place ?? undefined)
}

/**
 * Typeahead for every place-name field — the homepage search, adding a
 * territory, and onboarding. Public, like the homepage search it serves: it
 * only relays postcodes.io's own free place list, and caps the query length.
 */
export async function suggestPlacesAction(query: string): Promise<PlaceSuggestion[]> {
  if (typeof query !== 'string') return []
  const q = query.trim()
  if (q.length < 2 || q.length > 60 || looksLikePostcode(q)) return []
  return searchPlaces(q)
}
