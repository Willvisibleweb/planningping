// Data quality for one planning application — deterministic and explainable.
//
// This is NOT an accuracy rate. Nothing here has been measured against ground
// truth (that is what the benchmark tables are for). It is a fixed set of
// checks on completeness, traceability and freshness, each with a published
// weight, so anyone can recompute the number by hand and see exactly which
// check cost the points. The same input always yields the same score.
//
// Checks that the source never supplies (applicant names are redacted by
// PlanIt; no authority publishes a project value) are reported as information
// and never scored, so every record is not docked for a gap no source fills.
//
// Free of runtime imports so it can be tested with node --test.

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'info'
export type QualityLevel = 'High' | 'Medium' | 'Low'

export interface QualityInput {
  reference: string | null
  councilName: string | null
  address: string | null
  description: string | null
  status: string | null
  application_date: string | null
  decision_date: string | null
  source_url: string | null
  source_type: string | null
  has_location: boolean
  agent_company: string | null
  last_seen_at: string | null
  open_duplicate_candidates: number
}

export interface QualityCheck {
  id: string
  label: string
  status: CheckStatus
  weight: number
  earned: number
  detail?: string
}

export interface QualityAssessment {
  score: number
  maxScore: number
  level: QualityLevel
  checks: QualityCheck[]
  basis: string
}

export const QUALITY_WEIGHTS = {
  reference: 15,
  authority: 10,
  source_link: 15,
  description: 10,
  address: 10,
  location: 5,
  status: 10,
  dates: 10,
  freshness: 10,
  duplicates: 5,
} as const

export const LEVEL_THRESHOLDS = { high: 85, medium: 65 } as const

const FRESH_DAYS = 3
const AGEING_DAYS = 14
const POSTCODE = /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i
const UNKNOWN_STATUS = /^(unknown|unresolved|n\/?a|-)$/i

export function levelFor(score: number): QualityLevel {
  if (score >= LEVEL_THRESHOLDS.high) return 'High'
  if (score >= LEVEL_THRESHOLDS.medium) return 'Medium'
  return 'Low'
}

function isHttpUrl(value: string | null): boolean {
  if (!value) return false
  try {
    const u = new URL(value)
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}

function daysBetween(fromIso: string, now: Date): number {
  return (now.getTime() - new Date(fromIso).getTime()) / 86_400_000
}

export function describeAge(days: number): string {
  if (days < 1 / 24) return 'less than an hour ago'
  if (days < 1) {
    const hours = Math.floor(days * 24)
    return `${hours} hour${hours === 1 ? '' : 's'} ago`
  }
  const whole = Math.floor(days)
  return `${whole} day${whole === 1 ? '' : 's'} ago`
}

function check(id: string, label: string, weight: number, status: CheckStatus, detail?: string, earned?: number): QualityCheck {
  const value = earned ?? (status === 'pass' ? weight : 0)
  return { id, label, status, weight, earned: value, ...(detail ? { detail } : {}) }
}

export function assessDataQuality(input: QualityInput, now: Date = new Date()): QualityAssessment {
  const W = QUALITY_WEIGHTS
  const checks: QualityCheck[] = []

  const ref = input.reference?.trim() ?? ''
  const refValid = ref.length >= 3 && ref.length <= 60 && /\d/.test(ref)
  checks.push(
    refValid
      ? check('reference', 'Planning reference present', W.reference, 'pass', ref)
      : check('reference', ref ? 'Planning reference looks malformed' : 'No planning reference', W.reference, 'fail', ref || undefined),
  )

  checks.push(
    input.councilName
      ? check('authority', 'Planning authority identified', W.authority, 'pass', input.councilName)
      : check('authority', 'Planning authority not recognised', W.authority, 'fail'),
  )

  if (isHttpUrl(input.source_url)) {
    checks.push(check('source_link', 'Original source record linked', W.source_link, 'pass'))
  } else {
    checks.push(
      check(
        'source_link',
        'No link to the original record',
        W.source_link,
        'fail',
        input.source_type === 'legacy_scrape' ? 'Collected by a retired scraper that did not store links' : undefined,
      ),
    )
  }

  const desc = input.description?.trim() ?? ''
  if (desc.length >= 15) checks.push(check('description', 'Development description present', W.description, 'pass'))
  else if (desc.length > 0) checks.push(check('description', 'Description is very short', W.description, 'warn', undefined, Math.floor(W.description / 2)))
  else checks.push(check('description', 'No development description', W.description, 'fail'))

  const address = input.address?.trim() ?? ''
  if (address.length >= 8 && POSTCODE.test(address)) checks.push(check('address', 'Site address with postcode', W.address, 'pass'))
  else if (address.length >= 8) checks.push(check('address', 'Site address has no postcode', W.address, 'warn', undefined, Math.floor(W.address / 2)))
  else checks.push(check('address', 'No usable site address', W.address, 'fail'))

  checks.push(
    input.has_location
      ? check('location', 'Map location present', W.location, 'pass')
      : check('location', 'No map location', W.location, 'fail'),
  )

  const status = input.status?.trim() ?? ''
  if (status && !UNKNOWN_STATUS.test(status)) checks.push(check('status', 'Status known', W.status, 'pass', status))
  else checks.push(check('status', status ? 'Status reported as unknown' : 'No status published', W.status, 'fail'))

  const today = now.toISOString().slice(0, 10)
  const appDate = input.application_date
  if (!appDate) {
    checks.push(check('dates', 'No submission date', W.dates, 'fail'))
  } else if (appDate > today || appDate < '1990-01-01') {
    checks.push(check('dates', 'Submission date is implausible', W.dates, 'fail', appDate))
  } else if (input.decision_date && input.decision_date < appDate) {
    checks.push(check('dates', 'Decision date is earlier than submission date', W.dates, 'warn', undefined, Math.floor(W.dates / 2)))
  } else {
    checks.push(check('dates', 'Dates present and consistent', W.dates, 'pass'))
  }

  if (!input.last_seen_at) {
    checks.push(check('freshness', 'Never confirmed against the source', W.freshness, 'fail'))
  } else {
    const age = daysBetween(input.last_seen_at, now)
    if (age <= FRESH_DAYS) checks.push(check('freshness', `Checked ${describeAge(age)}`, W.freshness, 'pass'))
    else if (age <= AGEING_DAYS) checks.push(check('freshness', `Last checked ${describeAge(age)}`, W.freshness, 'warn', undefined, Math.floor(W.freshness / 2)))
    else checks.push(check('freshness', `Not re-checked for ${describeAge(age).replace(' ago', '')}`, W.freshness, 'fail'))
  }

  checks.push(
    input.open_duplicate_candidates > 0
      ? check('duplicates', 'Possible duplicate under review', W.duplicates, 'warn', undefined, 0)
      : check('duplicates', 'No duplicate flagged', W.duplicates, 'pass'),
  )

  // Information only — never scored. See the header for why.
  checks.push(
    input.agent_company
      ? check('agent', `Agent identified: ${input.agent_company}`, 0, 'info')
      : check('agent', 'Agent not published by the source', 0, 'info'),
  )
  checks.push(check('applicant', 'Applicant name not published by the source', 0, 'info'))
  checks.push(check('project_value', 'Project value not provided by the source', 0, 'info'))

  const maxScore = Object.values(W).reduce((a, b) => a + b, 0)
  const earned = checks.reduce((sum, c) => sum + c.earned, 0)
  const score = Math.round((earned / maxScore) * 100)

  return {
    score,
    maxScore: 100,
    level: levelFor(score),
    checks,
    basis: 'Calculated from fixed completeness, traceability and freshness checks. It is not a measured accuracy rate.',
  }
}
