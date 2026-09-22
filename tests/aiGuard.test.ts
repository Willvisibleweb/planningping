import { test } from 'node:test'
import assert from 'node:assert/strict'
import { containsMoney, extractFigures, findUnsupportedFigures } from '../lib/reliability/aiGuard.ts'

const source = 'Erection of 40 dwellings with associated access, drainage and 2.5 hectares of public open space.'

test('an invented project value is caught', () => {
  assert.deepEqual(findUnsupportedFigures('A £4.2m residential scheme with drainage scope.', [source]), ['£4.2m'])
})

test('figures taken from the source are allowed, even reworded', () => {
  assert.deepEqual(findUnsupportedFigures('Forty-home scheme: 40 homes on 2.5 hectares with drainage.', [source]), [])
})

test('an invented unit count is caught', () => {
  assert.deepEqual(findUnsupportedFigures('Likely 120 homes over three phases.', [source]), ['120 homes'])
})

test('figure extraction and money detection', () => {
  assert.ok(extractFigures('Around 15% of 300 sqm').length === 2)
  assert.equal(containsMoney('Large scheme, roughly £2,500,000'), true)
  assert.equal(containsMoney('Small single dwelling — modest scope'), false)
})

test('durations can be excluded where they are ordinary phrasing (a 15 minute call)', () => {
  assert.deepEqual(findUnsupportedFigures('Could we have a quick call in the next 2 weeks?', [source], ['money', 'count']), [])
  assert.deepEqual(findUnsupportedFigures('Construction should take 18 months.', [source]), ['18 months'])
})
