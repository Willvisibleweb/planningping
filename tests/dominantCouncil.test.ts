import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dominantCouncil } from '../lib/ingest/dominantCouncil.ts'

test('a single authority is the obvious answer', () => {
  assert.equal(dominantCouncil(['copeland', 'copeland', 'copeland']), 'copeland')
})

test('a boundary search picks the majority, not the first arrival', () => {
  // A 5km radius near a border legitimately returns neighbours. The territory
  // belongs to the authority most of its applications do, even when another
  // one happens to come back first.
  assert.equal(dominantCouncil(['allerdale', 'copeland', 'copeland', 'copeland', 'allerdale']), 'copeland')
})

test('ties break stably, so a territory does not oscillate between councils', () => {
  // Two authorities, one each. Whichever we choose must be the same next time
  // the same area is fetched — otherwise the dashboard would swap contents on
  // alternate runs.
  const first = dominantCouncil(['copeland', 'allerdale'])
  const reversed = dominantCouncil(['allerdale', 'copeland'])
  assert.equal(first, reversed)
  assert.equal(first, 'allerdale')
})

test('nothing to go on means no opinion', () => {
  // An empty or unusable answer must not overwrite the council we already had.
  assert.equal(dominantCouncil([]), null)
  assert.equal(dominantCouncil(['', '']), null)
})
