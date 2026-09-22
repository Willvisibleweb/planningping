import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sanitiseError, sanitiseMessage } from '../lib/reliability/sanitise.ts'

test('credentials are stripped from stored error messages', () => {
  const out = sanitiseMessage('fetch failed: Authorization: Bearer abc.def.ghi key=sk-ant-api03-SECRETSECRET https://x.test/?api_key=zzz&a=1')
  assert.doesNotMatch(out, /abc\.def|SECRETSECRET|zzz/)
  assert.match(out, /a=1/)
})

test('errors keep their message but never their stack', () => {
  const e = new TypeError('PlanIt HTTP 502 for postcode "CV1 1AN"')
  const out = sanitiseError(e)
  assert.equal(out, 'TypeError: PlanIt HTTP 502 for postcode "CV1 1AN"')
  assert.doesNotMatch(out, /at .*\(/)
})

test('long messages are truncated', () => {
  assert.ok(sanitiseMessage('x'.repeat(2000)).length <= 500)
})
