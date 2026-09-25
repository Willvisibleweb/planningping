// Turning a place name someone typed into the place they meant.
//
// PlanningPing is keyed on postcodes, but nobody thinks in postcodes: people
// type "Liverpool", "stoke on trent" or "Alton". postcodes.io's /places search
// (Ordnance Survey Open Names — free, no key, the service we already use for
// postcodes) answers those, but three things about its answers need handling:
//
// - It is a prefix search with no typo tolerance. "stoke on tret" returns
//   nothing at all, while "stoke on tr" finds Stoke-on-Trent. So a miss is
//   retried with a shorter query, and the wider set that comes back is ordered
//   by how close each name is to what was actually typed.
// - Names repeat. There are at least four Altons, and a hamlet in Wiltshire
//   comes back ahead of the town in Hampshire. Cities and towns go first, and
//   every suggestion carries its district so the person can tell them apart.
// - "Alton, Hampshire" is how people disambiguate, but the qualifier breaks the
//   prefix match. It is split off and used as a filter instead.
//
// Free of runtime imports so it can be tested with node --test.

/** One row of postcodes.io /places, trimmed to the fields we read. */
export interface RawPlace {
  code: string
  name_1: string
  local_type: string
  county_unitary: string | null
  district_borough: string | null
  region: string | null
  country?: string | null
  latitude: number
  longitude: number
}

export interface PlaceSuggestion {
  id: string
  name: string
  /** "East Hampshire, Hampshire" — what tells one Alton from another. */
  context: string
  /** City, Town, Village, Hamlet, Suburban Area, Other Settlement. */
  type: string
  lat: number
  lng: number
}

// Loose UK postcode shape, full or outward-only ("ST13", "st13 5jf"). Anything
// matching this is a postcode question, not a place-name question.
const POSTCODE_LIKE = /^[A-Z]{1,2}\d[A-Z\d]?(\s*\d[A-Z]{0,2})?$/i

export function looksLikePostcode(text: string): boolean {
  return POSTCODE_LIKE.test(text.trim())
}

// Bigger places first: someone typing "Alton" into a construction tool means
// the town of 18,000, not the hamlet of forty.
const TYPE_RANK: Record<string, number> = {
  City: 0,
  Town: 1,
  'Suburban Area': 2,
  Village: 3,
  'Other Settlement': 4,
  Hamlet: 5,
}

function typeRank(type: string): number {
  return TYPE_RANK[type] ?? 6
}

/** Lowercase, and treat hyphens and runs of spaces alike: "Stoke-on-Trent" = "stoke on trent". */
export function normalisePlaceName(text: string): string {
  return text
    .toLowerCase()
    .replace(/[-'’.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Split "Alton, Hampshire" into the name to search and the qualifier to filter
 * by. Only the first comma counts; "Alton, East Hampshire, UK" still leaves
 * something usable either way.
 */
export function splitQualifier(query: string): { name: string; qualifier: string | null } {
  const [name, ...rest] = query.split(',')
  const qualifier = normalisePlaceName(rest.join(' '))
  return { name: name.trim(), qualifier: qualifier || null }
}

/**
 * The shorter queries to try when the full one finds nothing, in order.
 *
 * Two fallbacks and no more — each is a network round trip the person is
 * waiting on. Dropping the last two characters catches a slip at the end of the
 * word ("stoke on tret", "liverpol"); the first four characters catch one in
 * the middle ("manchster"), at the cost of a broad list that similarity then
 * narrows back down.
 */
export function fallbackQueries(query: string): string[] {
  const q = query.trim()
  const out: string[] = []
  if (q.length >= 6) out.push(q.slice(0, -2).trim())
  if (q.length >= 5) out.push(q.slice(0, 4).trim())
  return [...new Set(out)].filter((s) => s.length >= 3 && s !== q)
}

/** Levenshtein distance, for ranking the broad results a fallback returns. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    prev = cur
  }
  return prev[b.length]
}

function contextOf(p: RawPlace): string {
  const parts = [p.district_borough, p.county_unitary]
    .filter((s): s is string => Boolean(s))
    // "City of Stoke-on-Trent" beside "Stoke-on-Trent" says nothing twice.
    .filter((s) => normalisePlaceName(s).replace(/^city of /, '') !== normalisePlaceName(p.name_1))
  const unique = [...new Set(parts)]
  return unique.length ? unique.join(', ') : (p.region ?? p.country ?? '')
}

export interface RankOptions {
  /** What the person typed, name part only — used for closeness. */
  query: string
  /** "hampshire" from "Alton, Hampshire", if given. */
  qualifier?: string | null
  /** True when these came from a shortened retry, so closeness must decide. */
  fuzzy?: boolean
  limit?: number
}

/**
 * Order raw results into the suggestions to show.
 *
 * On a normal prefix hit, an exact name beats a longer one ("Alton" before
 * "Alton Barnes") and then bigger places win. On a fuzzy retry the list is
 * broad and mostly wrong, so closeness to the original spelling comes first and
 * anything not reasonably close is dropped.
 */
export function rankPlaces(raw: RawPlace[], opts: RankOptions): PlaceSuggestion[] {
  const q = normalisePlaceName(opts.query)
  const limit = opts.limit ?? 6

  let rows = raw.filter(
    (p) => p.name_1 && Number.isFinite(p.latitude) && Number.isFinite(p.longitude),
  )

  if (opts.qualifier) {
    const qual = opts.qualifier
    const matching = rows.filter((p) =>
      [p.district_borough, p.county_unitary, p.region, p.country].some(
        (s) => s && normalisePlaceName(s).includes(qual),
      ),
    )
    // A qualifier that matches nothing was probably misspelt; ignoring it is
    // better than returning no answer.
    if (matching.length) rows = matching
  }

  const scored = rows.map((p) => {
    const name = normalisePlaceName(p.name_1)
    const distance = editDistance(q, name)
    return {
      p,
      exact: name === q ? 0 : 1,
      prefix: name.startsWith(q) ? 0 : 1,
      distance,
      rank: typeRank(p.local_type),
    }
  })

  const kept = opts.fuzzy
    ? // Within roughly one slip per four letters of what was typed.
      scored.filter((s) => s.distance <= Math.max(2, Math.ceil(q.length / 4)))
    : scored

  kept.sort((a, b) =>
    opts.fuzzy
      ? a.distance - b.distance || a.rank - b.rank
      : a.exact - b.exact || a.prefix - b.prefix || a.rank - b.rank || a.p.name_1.length - b.p.name_1.length,
  )

  // Open Names can list the same settlement more than once (a town and its
  // namesake suburban area). Same name in the same district is one place.
  const seen = new Set<string>()
  const out: PlaceSuggestion[] = []
  for (const { p } of kept) {
    const context = contextOf(p)
    const key = `${normalisePlaceName(p.name_1)}|${normalisePlaceName(context)}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      id: p.code,
      name: p.name_1,
      context,
      type: p.local_type,
      lat: p.latitude,
      lng: p.longitude,
    })
    if (out.length >= limit) break
  }
  return out
}

/**
 * Is the top answer clear enough to act on without asking?
 *
 * Used when someone submits free text without picking from the list. One
 * result, an exact-name city or town, or — for a typo — the only city or town
 * in the list, is safe. Four villages called Newton are not — guessing there sends someone's alerts to the
 * wrong end of the country.
 */
export function isUnambiguous(suggestions: PlaceSuggestion[], query: string): boolean {
  if (suggestions.length === 0) return false
  if (suggestions.length === 1) return true
  const q = normalisePlaceName(splitQualifier(query).name)
  const exactBig = suggestions.filter(
    (s) => normalisePlaceName(s.name) === q && typeRank(s.type) <= typeRank('Town'),
  )
  if (exactBig.length === 1 && exactBig[0] === suggestions[0]) return true
  const exact = suggestions.filter((s) => normalisePlaceName(s.name) === q)
  if (exact.length === 1 && exact[0] === suggestions[0]) return true
  // No exact name — a typo, usually. If the closest answer is the only city or
  // town among them ("manchster" → Manchester, not Mancetter), that is the one.
  const big = suggestions.filter((s) => typeRank(s.type) <= typeRank('Town'))
  return exact.length === 0 && big.length === 1 && big[0] === suggestions[0]
}
