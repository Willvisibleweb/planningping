import { test } from 'node:test'
import assert from 'node:assert/strict'
import { locationWindow, relevantForDigest } from '../lib/email/locationDigestPlan.ts'
import { isLocationSubject, locationSubject, locationSubscriptionId } from '../lib/email/unsubscribe.ts'

test('the window is the seven whole days ending yesterday', () => {
  // Monday 28 Sep -> last Monday 21st through Sunday 27th.
  const w = locationWindow(new Date('2026-09-28T06:00:00Z'))
  assert.equal(w.start, '2026-09-21')
  assert.equal(w.end, '2026-09-27')
})

test('running twice in a day cannot shift the window', () => {
  // Otherwise a re-run would cover a different week and could send an
  // application in two consecutive issues.
  const morning = locationWindow(new Date('2026-09-28T06:00:00Z'))
  const evening = locationWindow(new Date('2026-09-28T23:30:00Z'))
  assert.deepEqual(morning, evening)
})

test('today is never included, because today is not over', () => {
  const w = locationWindow(new Date('2026-09-28T06:00:00Z'))
  assert.ok(w.end < '2026-09-28')
})

test('only scored-relevant applications go to a stranger', () => {
  // The page promised applications "scored for civils scope". COLD is exactly
  // what the scoring rejected — householder extensions, tree works — and
  // sending it would make the email the noise the product removes.
  assert.equal(relevantForDigest('HOT'), true)
  assert.equal(relevantForDigest('WARM'), true)
  assert.equal(relevantForDigest('COLD'), false)
  // Unscored cannot honestly be described as scored.
  assert.equal(relevantForDigest(null), false)
})

test('a location subscriber and a user are never the same subject', () => {
  // Both flow through one unsubscribe link, page and one-click route, so the
  // subjects must not be confusable — a token minted for one must not act on
  // the other.
  const id = '9c4c5ac3-0495-41e4-97eb-c7155b9ead13'
  const subject = locationSubject(id)
  assert.equal(isLocationSubject(subject), true)
  assert.equal(isLocationSubject(id), false, 'a bare user id is not a location subject')
  assert.equal(locationSubscriptionId(subject), id)
})
