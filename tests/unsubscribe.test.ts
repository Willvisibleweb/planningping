import { test } from 'node:test'
import assert from 'node:assert/strict'

process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'

const { signUnsubscribe, verifyUnsubscribe, unsubscribePageUrl, unsubscribeHeaders, canEmail } =
  await import('../lib/email/unsubscribe.ts')

const ALICE = '11111111-1111-1111-1111-111111111111'
const BOB = '22222222-2222-2222-2222-222222222222'

test('a link signed for a user verifies for that user', () => {
  assert.equal(verifyUnsubscribe(ALICE, signUnsubscribe(ALICE)), true)
})

test("one user's signature cannot unsubscribe another", () => {
  assert.equal(verifyUnsubscribe(BOB, signUnsubscribe(ALICE)), false)
})

test('missing, empty and tampered tokens are rejected', () => {
  const t = signUnsubscribe(ALICE)
  assert.equal(verifyUnsubscribe(ALICE, ''), false)
  assert.equal(verifyUnsubscribe('', t), false)
  assert.equal(verifyUnsubscribe(ALICE, t.slice(0, -1)), false)
  assert.equal(verifyUnsubscribe(ALICE, t.slice(0, -1) + (t.endsWith('A') ? 'B' : 'A')), false)
})

test('the page link and one-click header carry a verifiable token', () => {
  const page = new URL(unsubscribePageUrl('https://planningping.com/', ALICE))
  assert.equal(page.pathname, '/unsubscribe')
  assert.equal(verifyUnsubscribe(page.searchParams.get('u')!, page.searchParams.get('t')!), true)

  const h = unsubscribeHeaders('https://planningping.com', ALICE)
  assert.equal(h['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click')
  const api = new URL(h['List-Unsubscribe'].slice(1, -1))
  assert.equal(api.pathname, '/api/unsubscribe')
  assert.equal(verifyUnsubscribe(api.searchParams.get('u')!, api.searchParams.get('t')!), true)
})

test('only subscribed profiles can be emailed', () => {
  assert.equal(canEmail({ emails_unsubscribed_at: null }), true)
  assert.equal(canEmail({ emails_unsubscribed_at: '2026-09-24T10:00:00Z' }), false)
  assert.equal(canEmail(null), false)
  assert.equal(canEmail(undefined), false)
})
