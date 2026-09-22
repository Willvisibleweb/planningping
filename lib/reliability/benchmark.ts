// Benchmarking PlanningPing against an external record of the same
// applications.
//
// Every metric here is a ratio of real, stored judgements, and returns null —
// never a default — when there is nothing to judge. A rate over zero items is
// not 100% and not 0%; it is "not measured yet", and the admin page shows it
// that way.
//
// compareField gives an automatic first verdict for the mechanical fields
// (reference, address, status, link). Anything it cannot decide cleanly is
// 'needs_review' rather than a guess, and review_method on the stored item
// records whether a person confirmed it.

import { extractPostcode, normaliseAddress, normaliseReference, normaliseUrl, textSimilarity } from './duplicates.ts'

export type Verdict = 'correct' | 'incorrect' | 'missing' | 'not_applicable' | 'needs_review'
export type ClassificationVerdict = 'reasonable' | 'unreasonable' | 'needs_review'
export type ComparableField = 'reference' | 'address' | 'applicant' | 'description' | 'status' | 'source_url'

export const BENCHMARK_FIELDS: ComparableField[] = ['reference', 'address', 'applicant', 'description', 'status', 'source_url']

export type StatusBucket = 'pending' | 'approved' | 'refused' | 'withdrawn' | 'invalid' | 'other'

export function statusBucket(status: string | null): StatusBucket | null {
  if (!status || !status.trim()) return null
  const s = status.toLowerCase()
  if (/withdraw/.test(s)) return 'withdrawn'
  if (/refus|reject|dismiss/.test(s)) return 'refused'
  if (/invalid/.test(s)) return 'invalid'
  if (/approv|grant|permit|conditions|consent|allowed|no objection|prior approval not required/.test(s)) return 'approved'
  if (/pending|undecided|register|consideration|assessment|awaiting|valid|consultation|received|progress|current/.test(s)) return 'pending'
  return 'other'
}

export function compareField(field: ComparableField, external: string | null, ours: string | null): Verdict {
  const ext = external?.trim() || null
  const own = ours?.trim() || null
  if (!ext) return 'not_applicable'
  if (!own) return 'missing'

  switch (field) {
    case 'reference':
      return normaliseReference(ext) === normaliseReference(own) ? 'correct' : 'incorrect'
    case 'address': {
      if (normaliseAddress(ext) === normaliseAddress(own)) return 'correct'
      const pe = extractPostcode(ext)
      const po = extractPostcode(own)
      if (pe && po && pe !== po) return 'incorrect'
      return textSimilarity(ext, own) >= 0.6 ? 'needs_review' : 'incorrect'
    }
    case 'description': {
      const sim = textSimilarity(ext, own)
      if (sim >= 0.9) return 'correct'
      if (sim >= 0.5) return 'needs_review'
      return 'incorrect'
    }
    case 'status': {
      const be = statusBucket(ext)
      const bo = statusBucket(own)
      if (!be || !bo || be === 'other' || bo === 'other') return 'needs_review'
      return be === bo ? 'correct' : 'incorrect'
    }
    case 'source_url': {
      const ue = normaliseUrl(ext)
      const uo = normaliseUrl(own)
      if (ue && uo && ue === uo) return 'correct'
      try {
        return new URL(ext).host.toLowerCase() === new URL(own).host.toLowerCase() ? 'needs_review' : 'incorrect'
      } catch {
        return 'needs_review'
      }
    }
    case 'applicant':
      return ext.toLowerCase() === own.toLowerCase() ? 'correct' : textSimilarity(ext, own) >= 0.6 ? 'needs_review' : 'incorrect'
  }
}

export interface BenchmarkItemResult {
  found: boolean | null
  reference_verdict: Verdict | null
  address_verdict: Verdict | null
  applicant_verdict: Verdict | null
  description_verdict: Verdict | null
  status_verdict: Verdict | null
  source_url_verdict: Verdict | null
  duplicate_count: number | null
  ai_claims_checked: number | null
  ai_unsupported_claims: number | null
  classification_verdict: ClassificationVerdict | null
  detection_delay_days: number | null
}

export interface Rate {
  value: number | null
  numerator: number
  denominator: number
}

function rate(numerator: number, denominator: number): Rate {
  return { value: denominator > 0 ? numerator / denominator : null, numerator, denominator }
}

export interface FieldAccuracy extends Rate {
  missing: number
  pendingReview: number
  notApplicable: number
}

export interface BenchmarkMetrics {
  items: number
  coverage: Rate
  fieldAccuracy: Record<ComparableField, FieldAccuracy>
  duplicateRate: Rate
  unsupportedClaimRate: Rate
  classificationReasonable: Rate
  averageDetectionDelayDays: number | null
  medianDetectionDelayDays: number | null
  delaySamples: number
}

const VERDICT_KEY: Record<ComparableField, keyof BenchmarkItemResult> = {
  reference: 'reference_verdict',
  address: 'address_verdict',
  applicant: 'applicant_verdict',
  description: 'description_verdict',
  status: 'status_verdict',
  source_url: 'source_url_verdict',
}

export function computeBenchmarkMetrics(items: BenchmarkItemResult[]): BenchmarkMetrics {
  const judgedCoverage = items.filter((i) => i.found !== null)
  const found = judgedCoverage.filter((i) => i.found === true)

  const fieldAccuracy = {} as Record<ComparableField, FieldAccuracy>
  for (const field of BENCHMARK_FIELDS) {
    const verdicts = found.map((i) => i[VERDICT_KEY[field]] as Verdict | null)
    const correct = verdicts.filter((v) => v === 'correct').length
    const incorrect = verdicts.filter((v) => v === 'incorrect').length
    const missing = verdicts.filter((v) => v === 'missing').length
    // Missing counts against accuracy: we did not have the value.
    fieldAccuracy[field] = {
      ...rate(correct, correct + incorrect + missing),
      missing,
      pendingReview: verdicts.filter((v) => v === 'needs_review' || v === null).length,
      notApplicable: verdicts.filter((v) => v === 'not_applicable').length,
    }
  }

  const dupJudged = found.filter((i) => typeof i.duplicate_count === 'number')
  const withClaims = found.filter((i) => typeof i.ai_claims_checked === 'number' && typeof i.ai_unsupported_claims === 'number')
  const claimsChecked = withClaims.reduce((s, i) => s + (i.ai_claims_checked as number), 0)
  const unsupported = withClaims.reduce((s, i) => s + (i.ai_unsupported_claims as number), 0)
  const classified = found.filter((i) => i.classification_verdict === 'reasonable' || i.classification_verdict === 'unreasonable')
  const delays = found
    .map((i) => i.detection_delay_days)
    .filter((d): d is number => typeof d === 'number' && Number.isFinite(d))
    .sort((a, b) => a - b)

  const median =
    delays.length === 0
      ? null
      : delays.length % 2 === 1
        ? delays[(delays.length - 1) / 2]
        : (delays[delays.length / 2 - 1] + delays[delays.length / 2]) / 2

  return {
    items: items.length,
    coverage: rate(found.length, judgedCoverage.length),
    fieldAccuracy,
    duplicateRate: rate(dupJudged.filter((i) => (i.duplicate_count as number) > 0).length, dupJudged.length),
    unsupportedClaimRate: rate(unsupported, claimsChecked),
    classificationReasonable: rate(classified.filter((i) => i.classification_verdict === 'reasonable').length, classified.length),
    averageDetectionDelayDays: delays.length > 0 ? delays.reduce((a, b) => a + b, 0) / delays.length : null,
    medianDetectionDelayDays: median,
    delaySamples: delays.length,
  }
}

/** Days between the external publication date and our first sighting. Negative means we saw it first. */
export function detectionDelayDays(externalPublished: string | null, firstSeenAt: string | null): number | null {
  if (!externalPublished || !firstSeenAt) return null
  const ext = new Date(`${externalPublished.slice(0, 10)}T00:00:00Z`).getTime()
  const ours = new Date(firstSeenAt).getTime()
  if (!Number.isFinite(ext) || !Number.isFinite(ours)) return null
  return Math.round(((ours - ext) / 86_400_000) * 10) / 10
}
