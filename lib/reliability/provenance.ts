// Where every value on an application comes from.
//
// The product's promise is that a customer can tell a council fact from our
// interpretation of it. That was previously a convention held in each page's
// markup (a "Source data" label here, an "Analysis" label there). This makes it
// a registry: every field we show is declared once as source, derived,
// AI-generated or estimated, and anything null resolves to "unavailable"
// rather than to a plausible-looking placeholder.
//
// The origin of a column never varies by row — address always comes from the
// authority, band is always our scorer, ai_summary is always a model — so a
// static table is the whole model. What does vary is whether a source value
// can be traced: a row with a link to the original record is verified, a row
// from the retired scraper that stored no link is "from source, unlinked".
//
// Deliberately free of runtime imports so it can be tested with node --test.

export type FieldOrigin = 'source' | 'derived' | 'ai_generated' | 'estimated'

export type ProvenanceKind =
  | 'source_verified'
  | 'source_unlinked'
  | 'derived'
  | 'ai_generated'
  | 'estimated'
  | 'unavailable'

export interface FieldSpec {
  label: string
  origin: FieldOrigin
  explanation: string
}

export const APPLICATION_FIELDS = {
  reference: { label: 'Planning reference', origin: 'source', explanation: 'The authority’s own application reference.' },
  council_slug: { label: 'Planning authority', origin: 'source', explanation: 'The authority that holds the record.' },
  address: { label: 'Site address', origin: 'source', explanation: 'As published by the authority.' },
  description: { label: 'Development description', origin: 'source', explanation: 'The authority’s published description, unedited.' },
  status: { label: 'Status', origin: 'source', explanation: 'The authority’s current status wording.' },
  application_date: { label: 'Submitted', origin: 'source', explanation: 'Date the authority received or validated the application.' },
  decision_date: { label: 'Decision date', origin: 'source', explanation: 'Date of the authority’s decision, where one is recorded.' },
  target_decision_date: { label: 'Decision due', origin: 'source', explanation: 'The authority’s target determination date.' },
  agent_company: { label: 'Agent', origin: 'source', explanation: 'Agent company named on the planning record.' },
  applicant: { label: 'Applicant', origin: 'source', explanation: 'Our source redacts applicant names, so this is not held.' },
  app_type: { label: 'Application type', origin: 'source', explanation: 'Application type as classified by the source.' },
  project_value: { label: 'Project value', origin: 'source', explanation: 'Planning authorities do not publish a project value in the data we receive.' },
  score: { label: 'Fit score', origin: 'derived', explanation: 'Keyword and rules scoring by PlanningPing, not an authority value.' },
  band: { label: 'Fit band', origin: 'derived', explanation: 'Band derived from the fit score.' },
  score_reasons: { label: 'Scoring signals', origin: 'derived', explanation: 'Keywords and rules that produced the score.' },
  application_type: { label: 'Discharge classification', origin: 'derived', explanation: 'Classified by PlanningPing from the description.' },
  parent_application_reference: { label: 'Parent reference', origin: 'derived', explanation: 'Extracted by PlanningPing from the description text.' },
  is_stale: { label: 'Stale flag', origin: 'derived', explanation: 'Set by PlanningPing when no decision appears in time.' },
  postcode_district: { label: 'Postcode district', origin: 'derived', explanation: 'Parsed by PlanningPing from the address.' },
  opportunity_match: { label: 'Match score', origin: 'derived', explanation: 'Calculated by PlanningPing against your company profile.' },
  ai_summary: { label: 'AI summary', origin: 'ai_generated', explanation: 'Written by an AI model from the source description only.' },
  outreach_value_signal: { label: 'Size signal', origin: 'estimated', explanation: 'An AI estimate of scale from the description; never a figure from the source.' },
} as const satisfies Record<string, FieldSpec>

export type ApplicationFieldKey = keyof typeof APPLICATION_FIELDS

export const PROVENANCE_LABEL: Record<ProvenanceKind, string> = {
  source_verified: 'From source record',
  source_unlinked: 'From source (no link on file)',
  derived: 'PlanningPing analysis',
  ai_generated: 'AI-generated',
  estimated: 'Estimate',
  unavailable: 'Not provided',
}

export function isMissing(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim().length === 0
  if (Array.isArray(value)) return value.length === 0
  return false
}

/** The provenance of one field on one application. */
export function provenanceOf(
  field: ApplicationFieldKey,
  value: unknown,
  ctx: { hasSourceLink: boolean },
): ProvenanceKind {
  if (isMissing(value)) return 'unavailable'
  const origin = APPLICATION_FIELDS[field].origin
  if (origin === 'source') return ctx.hasSourceLink ? 'source_verified' : 'source_unlinked'
  return origin
}

/** What to show for a value: the value itself, or an honest "Not provided". */
export function displayValue(value: unknown, fallback = 'Not provided'): string {
  if (isMissing(value)) return fallback
  return String(value)
}

export function fieldsByOrigin(origin: FieldOrigin): ApplicationFieldKey[] {
  return (Object.keys(APPLICATION_FIELDS) as ApplicationFieldKey[]).filter(
    (key) => APPLICATION_FIELDS[key].origin === origin,
  )
}
