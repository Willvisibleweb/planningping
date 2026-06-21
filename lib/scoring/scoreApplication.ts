// =============================================================================
// CIVILS LEAD-SCORING ENGINE
// =============================================================================
//
// This file is intentionally "dumb": it contains NO criteria, only the
// mechanism. All tunable numbers and keywords live in ./civilsCriteria.ts —
// edit that file, not this one.
//
// It scores one application and explains itself via `matchedReasons`, so a demo
// can show a director exactly why something is HOT, not a black box.
//
// FUTURE LLM SEAM:
//   This is keyword + rules only — fast, free, deterministic. If you later add
//   an LLM pass, the clean place to do it is a second function (e.g.
//   `scoreApplicationLLM`) that takes this function's output and refines
//   `score` / `matchedReasons`. Keep the rules pass as the cheap first filter;
//   only spend an LLM call on borderline WARM rows. Don't bake the LLM into
//   this function — keep the deterministic path intact for transparency.
// =============================================================================

import {
  BANDS,
  POSITIVE_GROUPS,
  EXCLUSION_GROUPS,
  DWELLING_BANDS,
  SITE_AREA_HECTARES,
  REFERENCE_SUFFIX_BONUS,
  FORCE_COLD_ON_EXCLUSION,
  type Band,
  type KeywordGroup,
} from './civilsCriteria'

// Minimal shape we need to score. Matches PlanningApplication but kept local so
// the engine doesn't depend on the DB types — anything with these fields works.
export interface ScorableApplication {
  reference?: string | null
  description?: string | null
  address?: string | null
}

export interface ScoreResult {
  score: number
  band: Band
  matchedReasons: string[]
}

// -----------------------------------------------------------------------------
// Keyword matching
// -----------------------------------------------------------------------------
// Whole-word, case-insensitive, punctuation-tolerant. We build the haystack
// from description + address (the only reliably-populated free-text fields).

function buildHaystack(app: ScorableApplication): string {
  return `${app.description ?? ''} ${app.address ?? ''}`.toLowerCase()
}

// Does `keyword` appear as a whole token/phrase in `haystack`?
// We escape the keyword and wrap it in word boundaries so "fell" doesn't match
// "fellow" and "sewer" doesn't match a random substring mid-word.
function keywordHits(haystack: string, keyword: string): boolean {
  const escaped = keyword.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\b${escaped}\\b`).test(haystack)
}

// Returns the groups that matched (any keyword hit), preserving group order.
function matchGroups(haystack: string, groups: KeywordGroup[]): KeywordGroup[] {
  return groups.filter((g) => g.keywords.some((kw) => keywordHits(haystack, kw)))
}

// -----------------------------------------------------------------------------
// Scheme-size parsing (best-effort, degrades to nothing)
// -----------------------------------------------------------------------------

// Pull the largest dwelling/unit count mentioned in the text, e.g.
// "erection of 120 dwellings" -> 120. Returns null if none found.
function parseDwellingCount(text: string): number | null {
  const re = /(\d{1,4})\s*(?:no\.?\s*)?(?:dwellings?|homes?|houses?|residential\s+units?|units?|apartments?|flats?)\b/gi
  let max: number | null = null
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const n = parseInt(m[1], 10)
    if (!Number.isNaN(n) && (max === null || n > max)) max = n
  }
  return max
}

// Pull a site area in hectares, e.g. "2.4 ha" / "2.4 hectares". Null if none.
function parseSiteAreaHectares(text: string): number | null {
  const m = /(\d+(?:\.\d+)?)\s*(?:ha\b|hectares?)/i.exec(text)
  return m ? parseFloat(m[1]) : null
}

// Uppercase suffix from an Idox-style reference, e.g. "24/01234/OUT" -> "OUT".
function referenceSuffix(reference?: string | null): string | null {
  if (!reference) return null
  const parts = reference.trim().toUpperCase().split('/')
  return parts.length > 1 ? parts[parts.length - 1] : null
}

// -----------------------------------------------------------------------------
// Main entry point
// -----------------------------------------------------------------------------

export function scoreApplication(app: ScorableApplication): ScoreResult {
  const haystack = buildHaystack(app)
  const reasons: string[] = []
  let score = 0

  // 1. Positive keyword groups.
  for (const g of matchGroups(haystack, POSITIVE_GROUPS)) {
    score += g.weight
    reasons.push(`${g.label} (+${g.weight})`)
  }

  // 2. Scheme size — dwellings (first band met, high to low).
  const dwellings = parseDwellingCount(haystack)
  if (dwellings !== null) {
    const tier = DWELLING_BANDS.find((b) => dwellings >= b.min)
    if (tier) {
      score += tier.bonus
      reasons.push(`${tier.label}: ${dwellings} units (+${tier.bonus})`)
    }
  }

  // 2b. Scheme size — site area in hectares.
  const hectares = parseSiteAreaHectares(haystack)
  if (hectares !== null && hectares >= SITE_AREA_HECTARES.min) {
    score += SITE_AREA_HECTARES.bonus
    reasons.push(`${SITE_AREA_HECTARES.label}: ${hectares} ha (+${SITE_AREA_HECTARES.bonus})`)
  }

  // 3. Reference-suffix bonus (e.g. outline applications).
  const suffix = referenceSuffix(app.reference)
  if (suffix && REFERENCE_SUFFIX_BONUS[suffix]) {
    const { bonus, label } = REFERENCE_SUFFIX_BONUS[suffix]
    score += bonus
    reasons.push(`${label} (+${bonus})`)
  }

  // 4. Exclusions (negative weight + optional hard cap to COLD).
  const exclusionsHit = matchGroups(haystack, EXCLUSION_GROUPS)
  for (const g of exclusionsHit) {
    score += g.weight // weight is negative
    reasons.push(`${g.label} (${g.weight})`)
  }

  // 5. Map score -> band.
  let band: Band
  if (FORCE_COLD_ON_EXCLUSION && exclusionsHit.length > 0) {
    band = 'COLD'
  } else if (score >= BANDS.hot) {
    band = 'HOT'
  } else if (score >= BANDS.warm) {
    band = 'WARM'
  } else {
    band = 'COLD'
  }

  return { score, band, matchedReasons: reasons }
}
