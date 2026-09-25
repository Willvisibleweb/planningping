import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  fallbackQueries,
  isUnambiguous,
  looksLikePostcode,
  rankPlaces,
  splitQualifier,
  type RawPlace,
} from '../lib/places/rankPlaces.ts'

function place(
  name: string,
  type: string,
  district: string | null,
  county: string | null,
  lat = 52,
  lng = -1,
): RawPlace {
  return {
    code: `${name}-${district ?? county}-${type}`,
    name_1: name,
    local_type: type,
    district_borough: district,
    county_unitary: county,
    region: 'Somewhere',
    latitude: lat,
    longitude: lng,
  }
}

// What postcodes.io actually returned for "alton", in its order: the hamlet
// first, the town third.
const ALTONS = [
  place('Alton', 'Hamlet', null, 'Wiltshire'),
  place('Alton', 'Village', 'North East Derbyshire', 'Derbyshire'),
  place('Alton', 'Town', 'East Hampshire', 'Hampshire'),
  place('Alton', 'Village', 'Staffordshire Moorlands', 'Staffordshire'),
  place('Alton Barnes', 'Village', null, 'Wiltshire'),
]

test('the town beats the hamlet of the same name', () => {
  const ranked = rankPlaces(ALTONS, { query: 'alton' })
  assert.equal(ranked[0].type, 'Town')
  assert.equal(ranked[0].context, 'East Hampshire, Hampshire')
})

test('an exact name comes before a longer one that starts the same', () => {
  const ranked = rankPlaces(ALTONS, { query: 'alton' })
  assert.equal(ranked.at(-1)?.name, 'Alton Barnes')
})

test('a county after a comma narrows the list instead of breaking the search', () => {
  const { name, qualifier } = splitQualifier('Alton, Staffordshire')
  assert.equal(name, 'Alton')
  const ranked = rankPlaces(ALTONS, { query: name, qualifier })
  assert.equal(ranked.length, 1)
  assert.equal(ranked[0].context, 'Staffordshire Moorlands, Staffordshire')
})

test('a misspelt qualifier is ignored rather than returning nothing', () => {
  const ranked = rankPlaces(ALTONS, { query: 'alton', qualifier: 'hamshire' })
  assert.equal(ranked.length, 5)
})

test('a fuzzy retry ranks by closeness to what was typed and drops the rest', () => {
  // The broad list "manc" brings back; the person typed "manchster".
  const broad = [
    place('Mancot', 'Village', null, 'Flintshire'),
    place('Manchester', 'City', 'Manchester', null),
    place('Manchester Airport', 'Other Settlement', 'Manchester', null),
  ]
  const ranked = rankPlaces(broad, { query: 'manchster', fuzzy: true })
  assert.deepEqual(ranked.map((r) => r.name), ['Manchester'])
})

test('hyphens and spaces are the same thing', () => {
  const ranked = rankPlaces(
    [place('Stoke-on-Tern', 'Village', null, 'Shropshire'), place('Stoke-on-Trent', 'City', null, 'City of Stoke-on-Trent')],
    { query: 'stoke on tret', fuzzy: true },
  )
  assert.equal(ranked[0].name, 'Stoke-on-Trent')
  // "City of Stoke-on-Trent" beside "Stoke-on-Trent" would say nothing twice.
  assert.equal(ranked[0].context, 'Somewhere')
})

test('the same place listed twice in one district is shown once', () => {
  const ranked = rankPlaces(
    [place('Leek', 'Town', 'Staffordshire Moorlands', 'Staffordshire'), place('Leek', 'Suburban Area', 'Staffordshire Moorlands', 'Staffordshire')],
    { query: 'leek' },
  )
  assert.equal(ranked.length, 1)
  assert.equal(ranked[0].type, 'Town')
})

test('fallback queries shorten the end first, then keep only the start', () => {
  assert.deepEqual(fallbackQueries('stoke on tret'), ['stoke on tr', 'stok'])
  assert.deepEqual(fallbackQueries('manchster'), ['manchst', 'manc'])
  // Too short to shorten into anything useful.
  assert.deepEqual(fallbackQueries('ely'), [])
})

test('one clear town is safe to act on without asking', () => {
  const ranked = rankPlaces(ALTONS, { query: 'alton' })
  assert.equal(isUnambiguous(ranked, 'alton'), true)
})

test('a typo that lands on the only city is acted on', () => {
  const broad = [place('Manchester', 'City', 'Manchester', null), place('Mancetter', 'Village', 'North Warwickshire', 'Warwickshire')]
  const ranked = rankPlaces(broad, { query: 'manchster', fuzzy: true })
  assert.equal(isUnambiguous(ranked, 'manchster'), true)
})

test('several villages of the same name are not guessed between', () => {
  const villages = [
    place('Newton', 'Village', 'A District', 'A County'),
    place('Newton', 'Village', 'B District', 'B County'),
  ]
  const ranked = rankPlaces(villages, { query: 'newton' })
  assert.equal(isUnambiguous(ranked, 'newton'), false)
})

test('postcodes, full or partial, are recognised and left to the postcode route', () => {
  for (const p of ['ST13', 'st13 5jf', 'SW1A 1AA', 'L3']) assert.equal(looksLikePostcode(p), true, p)
  for (const p of ['Liverpool', 'Stoke on Trent', 'Alton']) assert.equal(looksLikePostcode(p), false, p)
})
