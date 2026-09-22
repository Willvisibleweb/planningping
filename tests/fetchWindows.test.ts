import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MAX_RECOVERY_DAYS, planChangeWindow, planSubmissionWindow } from '../lib/reliability/fetchWindows.ts'

const NOW = new Date('2026-09-14T06:00:00Z')

test('first sync and short gaps use the rolling 30-day window', () => {
  assert.equal(planSubmissionWindow(null, NOW).mode, 'rolling')
  const w = planSubmissionWindow('2026-09-12T06:00:00Z', NOW)
  assert.equal(w.mode, 'rolling')
  assert.equal(w.startDate, '2026-08-15')
  assert.equal(w.endDate, '2026-09-14')
})

test('an outage longer than the rolling window recovers back to the last success with overlap', () => {
  // Down for 45 days: the window must reach 45 + 3 days back, not just 30.
  const w = planSubmissionWindow('2026-07-31T06:00:00Z', NOW)
  assert.equal(w.mode, 'recovery')
  assert.equal(w.days, 48)
  assert.equal(w.startDate, '2026-07-28')
  assert.equal(w.capped, false)
})

test('very long outages are capped and say backfill-history is needed', () => {
  const w = planSubmissionWindow('2026-01-01T00:00:00Z', NOW)
  assert.equal(w.days, MAX_RECOVERY_DAYS)
  assert.equal(w.capped, true)
  assert.match(w.reason, /backfill-history/)
})

test('the change window reaches back past the last success', () => {
  assert.equal(planChangeWindow('2026-09-13T06:00:00Z', NOW).differentStart, '2026-09-12')
  const long = planChangeWindow('2026-06-01T00:00:00Z', NOW)
  assert.equal(long.capped, true)
  assert.equal(long.days, 30)
})

import { areaSourceKey, authoritySourceKey, normalisePostcodeKey } from '../lib/reliability/sourceKeys.ts'

test('the same place typed two ways is one source', () => {
  assert.equal(normalisePostcodeKey('ST104AJ'), 'ST10 4AJ')
  assert.equal(areaSourceKey('st10 4aj', 1), areaSourceKey('ST104AJ', 1))
  assert.notEqual(areaSourceKey('ST104AJ', 1), areaSourceKey('ST104AJ', 5))
  assert.equal(authoritySourceKey('leeds'), 'planit:authority:leeds')
})
