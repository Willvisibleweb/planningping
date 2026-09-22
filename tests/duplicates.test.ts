import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  canonicalReference,
  findDuplicateCandidates,
  normaliseReference,
  orderedPair,
  type DuplicateSubject,
} from '../lib/reliability/duplicates.ts'

const base = (over: Partial<DuplicateSubject>): DuplicateSubject => ({
  id: '00000000-0000-0000-0000-000000000001',
  council_slug: 'leeds',
  reference: '26/04287/ADV',
  address: '48 Call Lane Leeds LS1 6DT',
  description: 'Display of illuminated signage',
  application_date: '2026-08-20',
  source_url: 'https://publicaccess.leeds.gov.uk/online-applications/applicationDetails.do?keyVal=A1',
  ...over,
})

test('same reference at different authorities is NOT a duplicate (real production case)', () => {
  const leeds = base({})
  const westminster = base({
    id: '00000000-0000-0000-0000-000000000002',
    council_slug: 'westminster',
    address: 'Leicester Square London WC2H 7LE',
    source_url: null,
  })
  assert.deepEqual(findDuplicateCandidates([leeds], [westminster]), [])
})

test('reference differing only by spacing/case within an authority is a high-confidence duplicate', () => {
  const a = base({})
  const b = base({ id: '00000000-0000-0000-0000-000000000002', reference: '26/04287/adv ', source_url: null })
  const [match] = findDuplicateCandidates([b], [a])
  assert.equal(match.matchType, 'reference_variant')
  assert.equal(match.confidence, 'high')
})

test('full application and its listed building consent on the same site are not flagged', () => {
  const full = base({ reference: '26/04313/FULL', source_url: null, description: 'Replacement of 12 no. existing single-glazed timber windows' })
  const lbc = base({ id: '00000000-0000-0000-0000-000000000002', reference: '26/04314/LBC', source_url: null, description: 'Replacement of 12 no. existing single-glazed timber windows' })
  assert.deepEqual(findDuplicateCandidates([lbc], [full]), [])
})

test('two references sharing one source record are flagged for review, not merged', () => {
  const a = base({ council_slug: 'tower-hamlets', reference: 'PA/26/01256' })
  const b = base({ id: '00000000-0000-0000-0000-000000000002', council_slug: 'tower-hamlets', reference: 'PA/26/01256/NC' })
  const [match] = findDuplicateCandidates([b], [a])
  assert.equal(match.matchType, 'same_source_record')
  assert.equal(match.confidence, 'medium')
})

test('one source record under two authorities is flagged as likely misattribution', () => {
  const a = base({})
  const b = base({ id: '00000000-0000-0000-0000-000000000002', council_slug: 'bradford' })
  const [match] = findDuplicateCandidates([b], [a])
  assert.equal(match.matchType, 'cross_authority_same_source_url')
  assert.equal(match.confidence, 'high')
})

test('identical site, day and wording with the same reference type is a low-confidence flag', () => {
  const a = base({ reference: '26/1/FUL', source_url: null, description: 'Erection of a two storey rear extension and loft conversion' })
  const b = base({ id: '00000000-0000-0000-0000-000000000002', reference: '26/2/FUL', source_url: null, description: 'Erection of a two storey rear extension and loft conversion' })
  const [match] = findDuplicateCandidates([b], [a])
  assert.equal(match.matchType, 'same_site_same_day_same_description')
  assert.equal(match.confidence, 'low')
})

test('pairs are ordered, never self-paired, never repeated', () => {
  const a = base({ id: 'ffffffff-0000-0000-0000-000000000001' })
  const b = base({ id: '00000000-0000-0000-0000-000000000009', reference: '26/04287/adv' })
  const matches = findDuplicateCandidates([a, b], [a, b])
  assert.equal(matches.length, 1)
  assert.deepEqual([matches[0].applicationId, matches[0].candidateId], orderedPair(a.id, b.id))
  assert.ok(matches[0].applicationId < matches[0].candidateId)
})

test('canonicalReference keeps exact matches and maps spelling variants to the stored reference', () => {
  assert.equal(canonicalReference('26/1/FUL', ['26/1/FUL']), '26/1/FUL')
  assert.equal(canonicalReference('26/1/ful', ['26/1/FUL']), '26/1/FUL')
  assert.equal(canonicalReference('26 / 1 / FUL', ['26/1/FUL']), '26/1/FUL')
  assert.equal(canonicalReference('26/2/FUL', ['26/1/FUL']), '26/2/FUL')
  assert.equal(normaliseReference(' 26/1/ful '), '26/1/FUL')
})
