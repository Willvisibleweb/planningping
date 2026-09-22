import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compareField, computeBenchmarkMetrics, detectionDelayDays, statusBucket, type BenchmarkItemResult } from '../lib/reliability/benchmark.ts'

const item = (over: Partial<BenchmarkItemResult> = {}): BenchmarkItemResult => ({
  found: true,
  reference_verdict: 'correct',
  address_verdict: 'correct',
  applicant_verdict: 'missing',
  description_verdict: 'correct',
  status_verdict: 'correct',
  source_url_verdict: 'correct',
  duplicate_count: 0,
  ai_claims_checked: null,
  ai_unsupported_claims: null,
  classification_verdict: null,
  detection_delay_days: 1,
  ...over,
})

test('no benchmark data produces no numbers — never a default 100%', () => {
  const m = computeBenchmarkMetrics([])
  assert.equal(m.coverage.value, null)
  assert.equal(m.fieldAccuracy.address.value, null)
  assert.equal(m.unsupportedClaimRate.value, null)
  assert.equal(m.averageDetectionDelayDays, null)
})

test('coverage and field accuracy are simple ratios of stored verdicts', () => {
  const m = computeBenchmarkMetrics([
    item(),
    item({ address_verdict: 'incorrect', detection_delay_days: 3 }),
    item({ found: false, detection_delay_days: null }),
    item({ found: null }),
  ])
  assert.deepEqual([m.coverage.numerator, m.coverage.denominator], [2, 3])
  assert.equal(m.fieldAccuracy.address.value, 0.5)
  // Missing counts against accuracy: we did not have the applicant.
  assert.equal(m.fieldAccuracy.applicant.value, 0)
  assert.equal(m.fieldAccuracy.applicant.missing, 2)
  assert.equal(m.averageDetectionDelayDays, 2)
  assert.equal(m.medianDetectionDelayDays, 2)
})

test('needs_review verdicts are excluded until a person decides', () => {
  const m = computeBenchmarkMetrics([item({ status_verdict: 'needs_review' }), item()])
  assert.equal(m.fieldAccuracy.status.value, 1)
  assert.equal(m.fieldAccuracy.status.pendingReview, 1)
})

test('unsupported AI claim rate is per claim checked', () => {
  const m = computeBenchmarkMetrics([item({ ai_claims_checked: 4, ai_unsupported_claims: 1 }), item({ ai_claims_checked: 6, ai_unsupported_claims: 0 })])
  assert.equal(m.unsupportedClaimRate.value, 0.1)
})

test('field comparison normalises the mechanical differences only', () => {
  assert.equal(compareField('reference', '26/01447/FUL', '26/01447/ful'), 'correct')
  assert.equal(compareField('address', '75A Shaftesbury Road, London E7 8PD', '75a shaftesbury road london e7 8pd'), 'correct')
  assert.equal(compareField('address', '1 High St, E7 8PD', '9 Low Rd, N1 1AA'), 'incorrect')
  assert.equal(compareField('status', 'Granted', 'Permitted'), 'correct')
  assert.equal(compareField('status', 'Refused', 'Undecided'), 'incorrect')
  assert.equal(compareField('applicant', 'Mr Smith', null), 'missing')
  assert.equal(compareField('applicant', null, null), 'not_applicable')
  assert.equal(statusBucket('Conditions'), 'approved')
})

test('detection delay is measured, and negative when we saw it first', () => {
  assert.equal(detectionDelayDays('2026-09-01', '2026-09-03T00:00:00Z'), 2)
  assert.equal(detectionDelayDays('2026-09-05', '2026-09-03T00:00:00Z'), -2)
  assert.equal(detectionDelayDays(null, '2026-09-03T00:00:00Z'), null)
})
