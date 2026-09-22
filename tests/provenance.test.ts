import { test } from 'node:test'
import assert from 'node:assert/strict'
import { APPLICATION_FIELDS, displayValue, fieldsByOrigin, provenanceOf } from '../lib/reliability/provenance.ts'

test('AI output is always labelled AI-generated, never source', () => {
  assert.equal(APPLICATION_FIELDS.ai_summary.origin, 'ai_generated')
  assert.equal(provenanceOf('ai_summary', 'A summary', { hasSourceLink: true }), 'ai_generated')
  for (const key of Object.keys(APPLICATION_FIELDS)) {
    if (key.startsWith('ai_')) assert.equal(APPLICATION_FIELDS[key as keyof typeof APPLICATION_FIELDS].origin, 'ai_generated', key)
  }
})

test('scores, bands and classifications are derived, not source facts', () => {
  for (const key of ['score', 'band', 'score_reasons', 'application_type', 'parent_application_reference', 'opportunity_match'] as const) {
    assert.equal(APPLICATION_FIELDS[key].origin, 'derived', key)
    assert.equal(provenanceOf(key, 'x', { hasSourceLink: true }), 'derived')
  }
})

test('source facts are verified only when the original record is linked', () => {
  assert.equal(provenanceOf('status', 'Undecided', { hasSourceLink: true }), 'source_verified')
  assert.equal(provenanceOf('status', 'Undecided', { hasSourceLink: false }), 'source_unlinked')
})

test('missing values are unavailable and display as "Not provided", never a placeholder value', () => {
  assert.equal(provenanceOf('project_value', null, { hasSourceLink: true }), 'unavailable')
  assert.equal(provenanceOf('address', '   ', { hasSourceLink: true }), 'unavailable')
  assert.equal(displayValue(null), 'Not provided')
  assert.equal(displayValue(''), 'Not provided')
  assert.equal(displayValue('Approved'), 'Approved')
})

test('estimates are their own category', () => {
  assert.deepEqual(fieldsByOrigin('estimated'), ['outreach_value_signal'])
})
