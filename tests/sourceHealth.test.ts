import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assessSourceHealth, summariseHealth, type RunSample } from '../lib/reliability/sourceHealth.ts'

const NOW = new Date('2026-09-14T12:00:00Z')
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString()
const ok = (d: number, n: number): RunSample => ({ started_at: daysAgo(d), status: 'success', records_returned: n, window_days: 30 })
const fail = (d: number, msg = 'PlanIt HTTP 502'): RunSample => ({ started_at: daysAgo(d), status: 'failed', records_returned: null, error_message: msg, window_days: 30 })
const rateLimit = (d: number): RunSample => ({ ...fail(d, 'PlanIt HTTP 429'), http_status: 429 })
const history = [ok(1, 42), ok(2, 40), ok(3, 38), ok(4, 45), ok(5, 41)]

test('normal counts are healthy with a stated range', () => {
  const h = assessSourceHealth([ok(0.1, 43), ...history], NOW)
  assert.equal(h.status, 'healthy')
  assert.deepEqual(h.expectedRange, { low: 30, high: 54 })
  assert.equal(h.lastCount, 43)
})

test('zero records from a source that normally returns ~40 is CRITICAL, not a quiet day', () => {
  const h = assessSourceHealth([ok(0.1, 0), ...history], NOW)
  assert.equal(h.status, 'failed')
  assert.match(h.reasons.join(' '), /CRITICAL/)
  assert.match(h.reasons.join(' '), /100% below normal range/)
})

test('a sharp drop is degraded, a mild one a warning, an unusual spike a warning', () => {
  assert.equal(assessSourceHealth([ok(0.1, 10), ...history], NOW).status, 'degraded')
  assert.equal(assessSourceHealth([ok(0.1, 25), ...history], NOW).status, 'warning')
  assert.equal(assessSourceHealth([ok(0.1, 90), ...history], NOW).status, 'warning')
})

test('one failure after a recent success is degraded; three in a row is failed', () => {
  assert.equal(assessSourceHealth([fail(0.1), ...history], NOW).status, 'degraded')
  const h = assessSourceHealth([fail(0.1), fail(1), fail(2), ...history.map((r, i) => ({ ...r, started_at: daysAgo(3 + i) }))], NOW)
  assert.equal(h.status, 'failed')
  assert.equal(h.consecutiveFailures, 3)
  assert.equal(h.lastError, 'PlanIt HTTP 502')
})

test('one PlanIt rate limit after a recent success is warning, not a customer-facing outage', () => {
  const h = assessSourceHealth([rateLimit(0.1), ...history], NOW)
  assert.equal(h.status, 'warning')
  assert.match(h.reasons.join(' '), /Rate-limited once/)
  assert.equal(
    assessSourceHealth([rateLimit(0.1), rateLimit(1), rateLimit(2), ...history.map((r, i) => ({ ...r, started_at: daysAgo(3 + i) }))], NOW).status,
    'failed',
  )
})

test('a successful run after failures recovers to healthy', () => {
  const h = assessSourceHealth([ok(0.1, 41), fail(1), fail(2), ...history.map((r, i) => ({ ...r, started_at: daysAgo(3 + i) }))], NOW)
  assert.equal(h.status, 'healthy')
  assert.equal(h.consecutiveFailures, 0)
})

test('truncated results are degraded even when the count looks normal', () => {
  assert.equal(assessSourceHealth([{ ...ok(0.1, 41), truncated: true }, ...history], NOW).status, 'degraded')
})

test('a source that has stopped being attempted is flagged', () => {
  assert.equal(assessSourceHealth(history.map((r) => ({ ...r, started_at: daysAgo(2) })), NOW).status, 'warning')
  assert.equal(assessSourceHealth(history.map((r) => ({ ...r, started_at: daysAgo(4) })), NOW).status, 'degraded')
})

test('with too little history the range is not invented', () => {
  const h = assessSourceHealth([ok(0.1, 0), ok(1, 40)], NOW)
  assert.equal(h.expectedRange, null)
  assert.equal(h.status, 'healthy')
  assert.match(h.reasons.join(' '), /still forming/)
})

test('recovery windows are not compared with rolling windows', () => {
  const recovery: RunSample = { ...ok(0.1, 140), window_days: 60 }
  const h = assessSourceHealth([recovery, ...history], NOW)
  assert.equal(h.expectedRange, null)
})

test('no runs is unknown, and summaries count each status', () => {
  assert.equal(assessSourceHealth([], NOW).status, 'unknown')
  assert.deepEqual(summariseHealth(['healthy', 'healthy', 'failed']), { healthy: 2, warning: 0, degraded: 0, failed: 1, unknown: 0 })
})
