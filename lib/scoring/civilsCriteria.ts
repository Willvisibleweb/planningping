// =============================================================================
// CIVILS LEAD-SCORING CRITERIA  —  THIS IS THE FILE YOU EDIT
// =============================================================================
//
// Hi future William. Everything tunable about how we score a planning
// application for "is there civil-engineering subcontract work here?" lives in
// THIS file. The scoring engine (scoreApplication.ts) is dumb on purpose — it
// just reads these numbers and keywords. To change behaviour, change the data
// below. You should never need to touch the engine.
//
// HOW SCORING WORKS (the 30-second version):
//   1. For each KEYWORD GROUP below, if ANY of its keywords appears in the
//      application's description+address, we add that group's `weight` ONCE
//      and record a human-readable reason.
//   2. We try to pull a scheme size (dwelling count / site area) out of the
//      description text and add a SIZE BONUS. If we can't find a number, we add
//      nothing — no penalty.
//   3. We add a small bonus based on the reference suffix (e.g. "/OUT").
//   4. EXCLUSION groups (householder extensions, tree works, etc.) have NEGATIVE
//      weights and, because FORCE_COLD_ON_EXCLUSION is true, also cap the band
//      at COLD.
//   5. The final number is mapped to a band via BANDS below.
//
// TO TUNE:
//   - Change a number?  Edit the `weight` / threshold inline.
//   - Add a keyword?    Add a string to the group's `keywords` array.
//   - Add a new group?  Copy a block, give it an `id`, `label`, `weight`, `keywords`.
//   - Kill a group?     Delete its block (or set weight to 0).
// Keywords are matched case-insensitively on whole words, so "sewer" won't match
// "sewerage"? — it WILL, because we match the word "sewer" as a token; but
// "drain" is a substring of "drainage", so prefer the most specific term you
// actually want. When in doubt, add both.
//
// =============================================================================


// -----------------------------------------------------------------------------
// GLOBAL SWITCHES
// -----------------------------------------------------------------------------

// When true, if ANY exclusion group matches, the band is forced to COLD no
// matter how high the positive score is. Flip to false to let a strong civils
// signal "rescue" an application that also tripped an exclusion.
// (You chose: force COLD.)
export const FORCE_COLD_ON_EXCLUSION = true


// -----------------------------------------------------------------------------
// BAND THRESHOLDS
// -----------------------------------------------------------------------------
// A total score >= hot  -> HOT
// A total score >= warm -> WARM
// Anything below warm   -> COLD
// (You chose: precise HOT at 45.)
export const BANDS = {
  hot: 45,
  warm: 20,
} as const

export type Band = 'HOT' | 'WARM' | 'COLD'


// -----------------------------------------------------------------------------
// POSITIVE KEYWORD GROUPS  —  signals that IMPLY civils scope
// -----------------------------------------------------------------------------
// Each group: hit it once (any keyword) -> add `weight`, record `label` reason.
// Higher weight = stronger implication of biddable civils work.

export interface KeywordGroup {
  id: string
  label: string    // shown in matchedReasons, e.g. "Drainage / SuDS scope"
  weight: number
  keywords: string[]
}

export const POSITIVE_GROUPS: KeywordGroup[] = [
  {
    id: 'drainage',
    label: 'Drainage / SuDS scope',
    weight: 25,
    keywords: [
      'drainage', 'suds', 'sustainable drainage', 'attenuation', 'soakaway',
      'swale', 'balancing pond', 'surface water', 'foul water', 'sewer',
      'pumping station',
    ],
  },
  {
    id: 'earthworks',
    label: 'Earthworks / groundworks scope',
    weight: 25,
    keywords: [
      'groundworks', 'earthworks', 'excavation', 'cut and fill', 'piling',
      'foundations', 'substructure', 'remediation', 'contaminated land',
      'ground stabilisation',
    ],
  },
  {
    id: 'highways',
    label: 'Highways / access scope',
    weight: 22,
    keywords: [
      'highway', 'highways', 's278', 'section 278', 's38', 'section 38',
      'access road', 'junction', 'roundabout', 'estate road', 'carriageway',
      'footway', 'priority junction',
    ],
  },
  {
    id: 'structural',
    label: 'Structural / retaining scope',
    weight: 18,
    keywords: [
      'retaining wall', 'structural', 'reinforced concrete', 'basement',
      'underpinning', 'gabion', 'sheet pile',
    ],
  },
  {
    id: 'flood',
    label: 'Flood / water management scope',
    weight: 18,
    keywords: [
      'flood risk', 'flood mitigation', 'flood alleviation', 'culvert',
      'watercourse', 'fluvial', 'ordinary watercourse',
    ],
  },
  {
    id: 'infrastructure',
    label: 'Infrastructure / enabling works',
    weight: 15,
    keywords: [
      'infrastructure', 'enabling works', 'site preparation', 'demolition',
      'levelling', 'hardstanding', 'service diversion', 'utilities',
    ],
  },
  {
    id: 'major_dev',
    label: 'Major development type',
    weight: 15,
    keywords: [
      'residential development', 'dwellings', 'housing', 'warehouse',
      'distribution', 'logistics', 'industrial unit', 'mixed use',
      'employment', 'business park', 'solar farm', 'battery storage',
    ],
  },
]


// -----------------------------------------------------------------------------
// EXCLUSION GROUPS  —  signals it is NOT civils work (negative weight)
// -----------------------------------------------------------------------------
// Same shape as positive groups, but weights are negative. With
// FORCE_COLD_ON_EXCLUSION = true, matching any of these also caps the band at
// COLD.

export const EXCLUSION_GROUPS: KeywordGroup[] = [
  {
    id: 'householder',
    label: 'Householder / minor works',
    weight: -30,
    keywords: [
      'single storey extension', 'rear extension', 'side extension',
      'loft conversion', 'porch', 'conservatory', 'dormer',
      'garage conversion', 'fence', 'summerhouse', 'householder',
    ],
  },
  {
    id: 'non_build',
    label: 'Non-build consent',
    weight: -25,
    keywords: [
      'tree works', 'tpo', 'fell', 'prune', 'advertisement', 'signage',
      'listed building consent', 'lawful development certificate',
      'non-material amendment', 'discharge of condition',
    ],
  },
]


// -----------------------------------------------------------------------------
// SCHEME-SIZE SIGNAL
// -----------------------------------------------------------------------------
// We try to read a number of dwellings/units out of the description text, plus
// a site area in hectares. These are bonuses on top of the keyword score.
// If nothing is found, contribution is 0 (NOT a penalty) — most descriptions
// won't state a number, and that's fine.

// Dwelling-count bands: first band whose `min` the count meets wins.
// Ordered high -> low.
export const DWELLING_BANDS: { min: number; bonus: number; label: string }[] = [
  { min: 100, bonus: 30, label: 'Large scheme (100+ units)' },
  { min: 50,  bonus: 20, label: 'Medium scheme (50–99 units)' },
  { min: 10,  bonus: 10, label: 'Small scheme (10–49 units)' },
]

// Site area in hectares: bonus if a stated area meets `min`.
export const SITE_AREA_HECTARES = { min: 1, bonus: 15, label: 'Large site (1+ ha)' }

// Reference-suffix bonuses. Idox refs often end in a type code, e.g.
// "24/01234/OUT". Outline applications usually signal a larger strategic site.
// Key = uppercase suffix, value = bonus + reason label.
export const REFERENCE_SUFFIX_BONUS: Record<string, { bonus: number; label: string }> = {
  OUT: { bonus: 8, label: 'Outline application (strategic site)' },
}
