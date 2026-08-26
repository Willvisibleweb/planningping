// Filtering the opportunity feed.
//
// Every filter here is backed by data that actually exists. Deliberately absent
// are two that competitors advertise and we cannot honestly offer:
//
//   Minimum project value — no value data in the feed at all. PlanIt does not
//     carry it and councils rarely publish it. A slider that silently matched
//     nothing would be worse than no slider.
//   Building type — not a field we hold. The closest honest proxy is the
//     application type below, which is what is offered instead.
//
// Filters are read from and written to the URL rather than component state, so
// a filtered view can be bookmarked, shared with a colleague, and survives a
// refresh — and so the page can stay a server component and filter in the
// database rather than shipping every row to the browser to be hidden.

import { POSITIVE_GROUPS, whereReason } from '@/lib/scoring/civilsCriteria'

// --- Scope / trade ----------------------------------------------------------
//
// The scorer writes its reasons as `${label} (+${weight})` from the constants in
// civilsCriteria, so the exact stored string is derivable rather than guessed.
// Deriving it means a change to a label or a weight cannot leave this filter
// quietly matching nothing — the two move together by construction.
export const SCOPES = POSITIVE_GROUPS.map((g) => ({
  id: g.id,
  label: g.label.replace(/ scope$| works$/, ''),
  // The precise element to look for inside score_reasons.
  reason: `${g.label} (+${g.weight})`,
}))

// --- Decision state ---------------------------------------------------------
//
// Councils publish 21 different status strings for what are really four
// outcomes — "Awaiting decision" and "Awaiting Decision" are separate values in
// the live data, as are "Pending", "Pending consideration" and "Pending
// decision". Offering the raw list as a dropdown would be unusable, so states
// are matched on keywords, the same approach lib/statusStyle already takes for
// colour.
export const DECISION_STATES = [
  { id: 'undecided', label: 'Undecided', patterns: ['pending', 'await', 'consider', 'assess', 'valid', 'registered', 'consult', 'undecided'] },
  { id: 'approved', label: 'Approved', patterns: ['approv', 'grant', 'permit', 'decided'] },
  { id: 'refused', label: 'Refused', patterns: ['refus', 'reject', 'dismiss'] },
  { id: 'withdrawn', label: 'Withdrawn', patterns: ['withdraw'] },
] as const

// --- Submitted within -------------------------------------------------------
export const DATE_RANGES = [
  { id: '7', label: 'Last 7 days', days: 7 },
  { id: '30', label: 'Last 30 days', days: 30 },
  { id: '90', label: 'Last 3 months', days: 90 },
] as const

// PlanIt's own classification. Values are its, not ours — listed rather than
// queried so the control renders identically on an empty account.
export const APP_TYPES = [
  'Full', 'Outline', 'Conditions', 'Amendment', 'Heritage', 'Trees', 'Advertising', 'Telecoms',
] as const

export interface OpportunityFilters {
  band: 'HOT' | 'WARM' | 'COLD' | null
  scope: string | null
  decision: string | null
  days: number | null
  appType: string | null
  council: string | null
  withContact: boolean
}

type Params = Record<string, string | string[] | undefined>

function one(params: Params, key: string): string | null {
  const v = params[key]
  const s = Array.isArray(v) ? v[0] : v
  return s && s.length > 0 ? s : null
}

/** Read filters out of the URL, discarding anything unrecognised. */
export function parseFilters(params: Params): OpportunityFilters {
  const band = one(params, 'band')
  const scope = one(params, 'scope')
  const decision = one(params, 'decision')
  const days = one(params, 'days')
  const appType = one(params, 'type')

  return {
    band: band === 'HOT' || band === 'WARM' || band === 'COLD' ? band : null,
    scope: SCOPES.some((s) => s.id === scope) ? scope : null,
    decision: DECISION_STATES.some((d) => d.id === decision) ? decision : null,
    days: DATE_RANGES.some((r) => r.id === days) ? Number(days) : null,
    appType: (APP_TYPES as readonly string[]).includes(appType ?? '') ? appType : null,
    council: one(params, 'council'),
    withContact: one(params, 'contact') === '1',
  }
}

export function activeFilterCount(f: OpportunityFilters): number {
  return [f.band, f.scope, f.decision, f.days, f.appType, f.council].filter(Boolean).length +
    (f.withContact ? 1 : 0)
}

// Loosely typed on purpose: this takes a PostgrestFilterBuilder mid-chain and
// hands it back, and importing the full generic signature for that buys nothing
// here. The call site keeps its own types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyFilters<T extends { [k: string]: any }>(query: T, f: OpportunityFilters): T {
  let q = query

  if (f.band) q = q.eq('band', f.band)
  if (f.council) q = q.eq('council_slug', f.council)
  if (f.withContact) q = q.not('agent_company', 'is', null)
  if (f.appType) q = q.eq('raw_data->>app_type', f.appType)

  if (f.scope) {
    const scope = SCOPES.find((s) => s.id === f.scope)
    // Containment against the jsonb array, not a LIKE over its text form —
    // exact element matching, so "Drainage / SuDS scope" cannot be matched by
    // an unrelated reason that happens to mention drainage.
    if (scope) q = whereReason(q, scope.reason)
  }

  if (f.days) {
    const cutoff = new Date(Date.now() - f.days * 86_400_000).toISOString().slice(0, 10)
    q = q.gte('application_date', cutoff)
  }

  if (f.decision) {
    const state = DECISION_STATES.find((d) => d.id === f.decision)
    if (state) {
      // ORed ilikes rather than an equality list: the point is to survive
      // wording we have not seen yet, from a council we have not onboarded yet.
      q = q.or(state.patterns.map((p) => `status.ilike.*${p}*`).join(','))
    }
  }

  return q
}

/** Rebuild a query string with one filter changed — the URL is the state. */
export function buildFilterHref(
  current: OpportunityFilters,
  key: keyof OpportunityFilters,
  value: string | null,
): string {
  const params = new URLSearchParams()
  const next = { ...current, [key]: value }

  if (next.band) params.set('band', next.band)
  if (next.scope) params.set('scope', String(next.scope))
  if (next.decision) params.set('decision', String(next.decision))
  if (next.days) params.set('days', String(next.days))
  if (next.appType) params.set('type', String(next.appType))
  if (next.council) params.set('council', String(next.council))
  if (key === 'withContact' ? value === '1' : next.withContact) params.set('contact', '1')

  const qs = params.toString()
  return qs ? `/leads?${qs}` : '/leads'
}
