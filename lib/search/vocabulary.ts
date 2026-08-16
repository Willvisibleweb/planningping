// Turning what a user types into what a council wrote.
//
// Planning descriptions are written in planning language. Someone looking for
// housing types "houses"; the description says "erection of 42 dwellings".
// Measured against the live corpus, the gap is not marginal:
//
//   "houses"    331 descriptions contain it — 322 more say "dwelling"
//   "car park"   72 contain it              — 212 more say "parking"
//   "flats"     151 contain it              —  60 more say "apartment"
//
// Postgres' english config stems, so "houses"/"housing"/"house" already collapse
// to one root and need no help here. What stemming cannot do is connect two
// different words that mean the same job. That is all this file is for.
//
// Kept in application code rather than a Postgres thesaurus deliberately: a
// thesaurus config is a file on the database server, which Supabase does not
// expose, and this list wants editing as the product learns the vocabulary.

/**
 * Groups of interchangeable terms. Order within a group doesn't matter — the
 * whole group is ORed together whenever any one of its members is typed.
 *
 * Multi-word entries are matched against the raw input before it is split into
 * words, so "car park" is recognised as one idea rather than "car" AND "park".
 */
const SYNONYM_GROUPS: string[][] = [
  ['house', 'houses', 'housing', 'dwelling', 'dwellings', 'dwellinghouse', 'residential'],
  ['flat', 'flats', 'apartment', 'apartments', 'maisonette'],
  ['car park', 'carpark', 'parking', 'hardstanding'],
  ['drainage', 'suds', 'surface water', 'attenuation', 'soakaway'],
  ['demolition', 'demolish', 'demolished'],
  ['extension', 'extensions', 'extend'],
  ['industrial', 'warehouse', 'warehousing', 'storage', 'distribution'],
  ['office', 'offices', 'commercial'],
  ['groundworks', 'earthworks', 'excavation', 'levelling'],
  ['highway', 'highways', 'road', 'roads', 'access', 'junction'],
  ['retaining', 'retaining wall', 'structural'],
  ['solar', 'photovoltaic', 'pv', 'renewable'],
  ['barn', 'agricultural', 'farm'],
  ['conversion', 'convert', 'change of use'],
]

// Longest first so "change of use" is found before "use" would be, and
// "car park" before "park".
const MULTI_WORD_TERMS = SYNONYM_GROUPS
  .flat()
  .filter((t) => t.includes(' '))
  .sort((a, b) => b.length - a.length)

function groupFor(term: string): string[] | null {
  return SYNONYM_GROUPS.find((g) => g.includes(term)) ?? null
}

// tsquery treats & | ! ( ) : * as operators. Stripping every character outside
// [a-z0-9] from each token means nothing the user types can be read as syntax —
// this is what makes it safe to build a raw tsquery rather than going through
// websearch_to_tsquery, which cannot express the OR groups synonyms need.
function sanitiseToken(token: string): string {
  return token.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Build a tsquery string from free text.
 *
 * Groups are ANDed (every idea must appear), synonyms within a group are ORed
 * (any wording will do). "new houses leek" becomes roughly:
 *
 *   new & (house | dwelling | residential | …) & leek
 *
 * Returns null when the input has nothing searchable left in it, so callers can
 * distinguish "no query" from "query that matched nothing".
 */
export function buildTsQuery(input: string): string | null {
  let remaining = input.toLowerCase()
  const groups: string[][] = []

  // Multi-word terms first, removed from the string as they're consumed so
  // their individual words aren't then searched again on their own.
  for (const term of MULTI_WORD_TERMS) {
    if (remaining.includes(term)) {
      const expanded = groupFor(term) ?? [term]
      groups.push(expanded)
      remaining = remaining.replace(term, ' ')
    }
  }

  for (const raw of remaining.split(/\s+/)) {
    const token = sanitiseToken(raw)
    if (!token) continue
    groups.push(groupFor(token) ?? [token])
  }

  if (groups.length === 0) return null

  const clauses = groups
    .map((group) => {
      const alternatives = [...new Set(
        group
          .map((term) =>
            // A multi-word synonym has to stay one idea. Joining its words with
            // <-> (the "immediately followed by" operator) keeps it a phrase:
            // "surface water" must not become surface OR water, or searching
            // for drainage returns every application mentioning water.
            term
              .split(/\s+/)
              .map(sanitiseToken)
              .filter(Boolean)
              .join(' <-> '),
          )
          .filter(Boolean),
      )]
      if (alternatives.length === 0) return null
      // Parenthesised so the ORs bind tighter than the ANDs joining groups —
      // without this, "houses leek" would parse as "house | (dwelling & leek)"
      // and return every house in the council.
      return alternatives.length === 1 ? alternatives[0] : `(${alternatives.join(' | ')})`
    })
    .filter((c): c is string => c !== null)

  return clauses.length > 0 ? clauses.join(' & ') : null
}

/**
 * Whether a query looks like someone pasting an application reference
 * ("26/04665/NMA", "SMD/2026/0373") rather than describing a scheme.
 *
 * References are excluded from the search vector because to_tsvector shreds
 * them into meaningless fragments, so these go down an exact-match path
 * instead — see searchTerritory.
 */
export function looksLikeReference(input: string): boolean {
  return /\d/.test(input) && /[/\-]/.test(input)
}
