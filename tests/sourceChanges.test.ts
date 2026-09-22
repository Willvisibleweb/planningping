import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contentHash, diffTrackedFields, mergeSticky, type TrackedValues } from '../lib/reliability/sourceChanges.ts'

const v = (over: Partial<TrackedValues> = {}): TrackedValues => ({
  status: 'Undecided',
  decision_date: null,
  description: 'Erection of 4 dwellings',
  address: '1 High Street, Leek ST13 5AA',
  agent_company: null,
  target_decision_date: null,
  application_date: '2026-08-01',
  app_type: 'Full',
  source_url: 'https://example.gov.uk/app/1',
  ...over,
})

test('hash ignores whitespace noise but not real changes', () => {
  assert.equal(contentHash(v()), contentHash(v({ description: '  Erection  of 4 dwellings ' })))
  assert.notEqual(contentHash(v()), contentHash(v({ status: 'Permitted' })))
})

test('a status change and a description revision are both recorded', () => {
  const changes = diffTrackedFields(v(), v({ status: 'Permitted', decision_date: '2026-09-10', description: 'Erection of 5 dwellings' }))
  assert.deepEqual(changes.map((c) => c.field).sort(), ['decision_date', 'description', 'status'])
  assert.deepEqual(changes.find((c) => c.field === 'status'), { field: 'status', old_value: 'Undecided', new_value: 'Permitted' })
})

test('filling a late-added column is backfill, not a source change', () => {
  assert.deepEqual(diffTrackedFields(v({ source_url: null }), v({ agent_company: 'Field & Fox' })), [])
})

test('a known agent is kept when the source omits it this time', () => {
  const merged = mergeSticky(v({ agent_company: 'Field & Fox' }), v())
  assert.equal(merged.agent_company, 'Field & Fox')
  assert.deepEqual(diffTrackedFields(v({ agent_company: 'Field & Fox' }), merged), [])
})

test('an agent replaced by a different agent is recorded', () => {
  const changes = diffTrackedFields(v({ agent_company: 'A Ltd' }), v({ agent_company: 'B Ltd' }))
  assert.deepEqual(changes, [{ field: 'agent_company', old_value: 'A Ltd', new_value: 'B Ltd' }])
})

test('case-only differences are not recorded as history', () => {
  assert.deepEqual(diffTrackedFields(v({ address: '1 HIGH STREET, LEEK ST13 5AA', status: 'Awaiting Decision' }), v({ status: 'Awaiting decision' })), [])
})

test('a source link with reordered parameters is the same link', () => {
  const a = v({ source_url: 'https://publicaccess.leeds.gov.uk/online-applications/applicationDetails.do?activeTab=summary&keyVal=TIZ58' })
  const b = v({ source_url: 'https://PublicAccess.leeds.gov.uk/online-applications/applicationDetails.do?keyVal=TIZ58&activeTab=summary' })
  assert.equal(contentHash(a), contentHash(b))
  assert.deepEqual(diffTrackedFields(a, b), [])
  const moved = v({ source_url: 'https://publicaccess.leeds.gov.uk/online-applications/applicationDetails.do?activeTab=summary&keyVal=OTHER' })
  assert.equal(diffTrackedFields(a, moved).length, 1)
})
