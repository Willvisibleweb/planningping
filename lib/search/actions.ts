'use server'

// Server-action wrapper around searchArea.
//
// Kept apart from the implementation so the search logic stays importable from
// server components (the homepage renders a default view without a round trip)
// while the client form can still call it on submit.

import { searchArea, type AreaSearchResult } from './areaSearch'

export async function searchAreaAction(
  query: string,
  scopeId?: string,
): Promise<AreaSearchResult> {
  return searchArea(query, scopeId)
}
