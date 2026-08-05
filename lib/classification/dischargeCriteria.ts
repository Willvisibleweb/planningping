// Discharge-of-condition classification data — the one place to tune the
// keyword list or parent-reference patterns. Mirrors the civilsCriteria.ts /
// scoreApplication.ts split (pure data here, pure engine in
// classifyApplication.ts). This is a SEPARATE concern from
// lib/scoring/civilsCriteria.ts's exclusion keywords — that list decides
// civils-relevance scoring, this one decides application type.

export const DISCHARGE_KEYWORDS = [
  'discharge of condition',
  'discharge of conditions',
  'approval of details reserved by condition',
  'compliance with condition',
  // Verified against real production data: councils commonly drop "of"
  // entirely — "discharge conditions 3, 5 and 6..." / "discharge Condition
  // 11..." are genuine live examples that the "of" variants above miss.
  'discharge condition',
  'discharge conditions',
] as const

// Real "reserved matters" applications sometimes share PlanIt's own
// app_type='Conditions' bucket (confirmed against live data) but must never
// classify as discharge_of_condition regardless of any other match.
export const RESERVED_MATTERS_PATTERN = /\breserved matters\b/i

// Tried in order, first capturing match wins. Lead-in-phrase patterns come
// first — safe for bare numeric refs like "243167", which are only matched
// in context, never as a standalone token anywhere in the text. Distinctive-
// shape fallbacks come last, since their shape alone rarely occurs by
// accident.
const TOKEN = String.raw`[A-Za-z0-9][A-Za-z0-9\/.\-]{2,24}[A-Za-z0-9]`

export const PARENT_REF_PATTERNS: RegExp[] = [
  // "...dated 12/03/24 (25/00759/PFUL3)"
  new RegExp(String.raw`planning permission[^(]{0,40}\((${TOKEN})\)`, 'i'),
  // "...planning permission reference X" / "planning permission ref: X"
  new RegExp(
    String.raw`planning permission(?:\s+dated\s+[\d/.\-]+)?,?\s*(?:reference|ref\.?|no\.?|number)\s*[:\-]?\s*(${TOKEN})`,
    'i',
  ),
  // "attached to planning permission X"
  new RegExp(String.raw`attached to planning permission\s+(${TOKEN})`, 'i'),
  // "relating to X" / "relating to planning permission X"
  new RegExp(String.raw`relating to(?:\s+planning permission)?\s+(${TOKEN})`, 'i'),
  // "condition N of planning permission X"
  new RegExp(String.raw`condition\s*\d+\s*of\s*planning permission\s+(${TOKEN})`, 'i'),
  // bare Idox-style fallback, e.g. 25/00759/PFUL3
  /\b(\d{2}\/\d{4,6}\/[A-Za-z0-9]{2,8})\b/,
  // bare prefixed-style fallback, e.g. SMD/2026/0159
  /\b([A-Za-z]{2,6}\/\d{4}\/\d{3,6})\b/,
]

// PHASE 2 (not started here — see plan doc for full context): the parent-
// reference text captured above is free-form and best-effort from
// description/title only. Phase 2 will add PDF/OCR parsing of the actual
// decision-notice/condition-schedule documents attached to an application —
// individual condition numbers and their discharge status ("condition 4 of
// 12 discharged") — feeding a higher-confidence resolver alongside this
// text-based one, not replacing it. Not scoped now: decision-notice
// formatting isn't consistent across councils and needs its own
// investigation before it can be built.
