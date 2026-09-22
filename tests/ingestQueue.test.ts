import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_ATTEMPTS,
  backoffMinutes,
  isLeaseExpired,
  isQueueComplete,
  jitterSeconds,
  planRetry,
  summariseQueue,
} from '../lib/reliability/ingestQueue.ts'

const NOW = new Date('2026-09-22T06:00:00Z')

test('backoff grows with each failure and then stops growing', () => {
  assert.equal(backoffMinutes(1), 5)
  assert.equal(backoffMinutes(2), 15)
  assert.equal(backoffMinutes(3), 45)
  assert.equal(backoffMinutes(4), 120)
  assert.equal(backoffMinutes(5), 360)
  // Past the end of the ladder it holds at the longest wait rather than
  // growing without bound.
  assert.equal(backoffMinutes(9), 360)
})

test('a rate limit waits longer than an ordinary failure', () => {
  // The whole point: a 429 means PlanIt is saturated, so coming back sooner
  // makes it worse for every other source still queued.
  for (const attempt of [1, 2, 3, 4, 5]) {
    assert.ok(
      backoffMinutes(attempt, { rateLimited: true }) > backoffMinutes(attempt),
      `rate-limited attempt ${attempt} should wait longer`,
    )
  }
  assert.equal(backoffMinutes(1, { rateLimited: true }), 20)
})

test('a failure schedules a retry in the future', () => {
  const decision = planRetry(1, { sourceKey: 'planit:area:ST10 4AJ@5', now: NOW })
  assert.equal(decision.status, 'pending')
  assert.equal(decision.waitMinutes, 5)
  assert.ok(new Date(decision.nextAttemptAt as string) > NOW)
})

test('sources that failed together do not all come back at the same moment', () => {
  // Without jitter, six sources rate-limited in one batch retry in lockstep
  // and rate-limit us again. The spread is deterministic so a retry time can
  // be explained after the fact.
  const keys = ['planit:area:M2 5DB@5', 'planit:area:NG1 5FS@5', 'planit:area:CV1 1AN@5', 'planit:area:BS7 9DZ@1']
  const times = keys.map((k) => planRetry(1, { sourceKey: k, now: NOW, rateLimited: true }).nextAttemptAt)
  assert.equal(new Set(times).size, keys.length, 'each source should get its own retry time')
  // Deterministic: the same key twice gives the same answer.
  assert.equal(jitterSeconds(keys[0]), jitterSeconds(keys[0]))
})

test('giving up is for today only, not permanently', () => {
  const decision = planRetry(MAX_ATTEMPTS, { sourceKey: 'planit:area:M2 5DB@5', now: NOW })
  assert.equal(decision.status, 'failed')
  assert.equal(decision.nextAttemptAt, null)
  assert.match(decision.reason, /tomorrow/)
})

test('a lease only counts as expired once it has actually run out', () => {
  const claimed = '2026-09-22T05:55:00Z'
  assert.equal(isLeaseExpired(claimed, 600, NOW), false, 'five minutes into a ten-minute lease')
  assert.equal(isLeaseExpired(claimed, 120, NOW), true, 'five minutes into a two-minute lease')
  assert.equal(isLeaseExpired(null, 600, NOW), false, 'never claimed is not expired')
})

test('the queue is only complete when nothing is left to run', () => {
  const jobs = (statuses: string[]) => statuses.map((status) => ({ status: status as 'pending' }))

  const half = summariseQueue(jobs(['done', 'done', 'pending', 'running']))
  assert.deepEqual(half, { total: 4, done: 2, failed: 0, pending: 1, running: 1 })
  assert.equal(isQueueComplete(half), false)

  // A source that gave up today is not coming back, so it does not hold the
  // finaliser open — otherwise one dead source would block the weekly digest.
  const finished = summariseQueue(jobs(['done', 'done', 'failed']))
  assert.equal(isQueueComplete(finished), true)

  // An empty queue is not a completed queue; nothing has been planned yet.
  assert.equal(isQueueComplete(summariseQueue([])), false)
})
