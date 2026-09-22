import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assessDataQuality, levelFor, QUALITY_WEIGHTS, type QualityInput } from '../lib/reliability/dataQuality.ts'

const NOW = new Date('2026-09-14T12:00:00Z')

const complete: QualityInput = {
  reference: '26/01447/FUL',
  councilName: 'Newham',
  address: '75A Shaftesbury Road Forest Gate London E7 8PD',
  description: 'Erection of a single storey rear extension',
  status: 'Undecided',
  application_date: '2026-08-01',
  decision_date: null,
  source_url: 'https://pa.newham.gov.uk/online-applications/applicationDetails.do?keyVal=X',
  source_type: 'planit',
  has_location: true,
  agent_company: null,
  last_seen_at: '2026-09-14T06:00:00Z',
  open_duplicate_candidates: 0,
}

test('weights sum to 100 so the score reads directly as points', () => {
  assert.equal(Object.values(QUALITY_WEIGHTS).reduce((a, b) => a + b, 0), 100)
})

test('a complete, fresh, linked record scores 100 / High', () => {
  const q = assessDataQuality(complete, NOW)
  assert.equal(q.score, 100)
  assert.equal(q.level, 'High')
})

test('the score is deterministic for the same input and time', () => {
  assert.deepEqual(assessDataQuality(complete, NOW), assessDataQuality(complete, NOW))
})

test('missing values fail their check and are never filled in', () => {
  const q = assessDataQuality(
    { ...complete, description: null, status: null, source_url: null, source_type: 'legacy_scrape', has_location: false },
    NOW,
  )
  const byId = Object.fromEntries(q.checks.map((c) => [c.id, c]))
  assert.equal(byId.description.status, 'fail')
  assert.equal(byId.status.status, 'fail')
  assert.equal(byId.source_link.status, 'fail')
  assert.match(byId.source_link.detail ?? '', /retired scraper/)
  assert.equal(q.score, 100 - 10 - 10 - 15 - 5)
  assert.equal(q.level, 'Low')
})

test('information-only checks (applicant, project value) never change the score', () => {
  const q = assessDataQuality(complete, NOW)
  const info = q.checks.filter((c) => c.status === 'info')
  assert.ok(info.some((c) => c.id === 'project_value' && /not provided/i.test(c.label)))
  assert.ok(info.every((c) => c.weight === 0 && c.earned === 0))
})

test('freshness decays: 10 days is a warning, 20 days fails, never-seen fails', () => {
  const at = (iso: string | null) => assessDataQuality({ ...complete, last_seen_at: iso }, NOW).checks.find((c) => c.id === 'freshness')!
  assert.equal(at('2026-09-04T12:00:00Z').status, 'warn')
  assert.equal(at('2026-08-25T12:00:00Z').status, 'fail')
  assert.equal(at(null).status, 'fail')
})

test('inconsistent and implausible dates are caught', () => {
  const inconsistent = assessDataQuality({ ...complete, decision_date: '2026-07-01' }, NOW).checks.find((c) => c.id === 'dates')!
  assert.equal(inconsistent.status, 'warn')
  const future = assessDataQuality({ ...complete, application_date: '2027-01-01' }, NOW).checks.find((c) => c.id === 'dates')!
  assert.equal(future.status, 'fail')
})

test('an open duplicate candidate costs its points', () => {
  assert.equal(assessDataQuality({ ...complete, open_duplicate_candidates: 1 }, NOW).score, 95)
})

test('the basis never claims measured accuracy', () => {
  assert.match(assessDataQuality(complete, NOW).basis, /not a measured accuracy rate/)
})

test('level thresholds', () => {
  assert.equal(levelFor(85), 'High')
  assert.equal(levelFor(84), 'Medium')
  assert.equal(levelFor(65), 'Medium')
  assert.equal(levelFor(64), 'Low')
})
