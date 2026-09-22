import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planIngest, type IncomingRecord, type StoredRecord } from '../lib/reliability/ingestPlan.ts'
import type { TrackedValues } from '../lib/reliability/sourceChanges.ts'

const values = (over: Partial<TrackedValues> = {}): TrackedValues => ({
  status: 'Undecided',
  decision_date: null,
  description: 'Erection of a detached garage',
  address: '2 Mill Lane, Cheadle ST10 1AA',
  agent_company: null,
  target_decision_date: '2026-10-01',
  application_date: '2026-08-20',
  app_type: 'Full',
  source_url: 'https://example.gov.uk/app/2',
  ...over,
})
const rec = (reference: string, over: Partial<TrackedValues> = {}, council = 'staffordshire-moorlands'): IncomingRecord => ({
  council_slug: council,
  reference,
  values: values(over),
})

// A tiny in-memory table standing in for planning_applications.
function applyPlan(store: StoredRecord[], plan: ReturnType<typeof planIngest>): StoredRecord[] {
  const next = [...store]
  for (const w of plan.writes) {
    const idx = next.findIndex((s) => s.council_slug === w.council_slug && s.reference === w.reference)
    const row: StoredRecord = {
      id: idx >= 0 ? next[idx].id : `id-${next.length + 1}`,
      council_slug: w.council_slug,
      reference: w.reference,
      content_hash: w.contentHash,
      values: w.values,
    }
    if (idx >= 0) next[idx] = row
    else next.push(row)
  }
  return next
}

test('ingesting the same records twice is idempotent', () => {
  const batch = [rec('SMD/2026/0280'), rec('SMD/2026/0281')]
  const first = planIngest(batch, [])
  assert.equal(first.writes.length, 2)
  assert.ok(first.writes.every((w) => w.isNew))
  const store = applyPlan([], first)

  const second = planIngest(batch, store)
  assert.equal(second.writes.length, 0)
  assert.equal(second.unchanged.length, 2)
})

test('an overlapping backfill window never creates a second row', () => {
  let store = applyPlan([], planIngest([rec('SMD/2026/0280'), rec('SMD/2026/0281')], []))
  // Backfill covering the same fortnight plus one new application, one of the
  // old ones arriving with different spacing/case.
  const plan = planIngest([rec('smd/2026/0280'), rec('SMD / 2026 / 0281'), rec('SMD/2026/0299')], store)
  store = applyPlan(store, plan)
  assert.equal(store.length, 3)
  assert.equal(plan.referenceVariantsResolved, 2)
  assert.equal(plan.writes.filter((w) => w.isNew).length, 1)
})

test('overlapping territory queries in one batch collapse to one record', () => {
  const plan = planIngest([rec('SMD/2026/0280'), rec('SMD/2026/0280'), rec('smd/2026/0280')], [])
  assert.equal(plan.writes.length, 1)
  assert.equal(plan.collapsedInBatch, 2)
})

test('the same reference at two authorities stays two applications', () => {
  const plan = planIngest([rec('26/01447/FUL', {}, 'newham'), rec('26/01447/FUL', {}, 'rushcliffe')], [])
  assert.equal(plan.writes.length, 2)
})

test('a status change is written once, with its history, and then settles', () => {
  let store = applyPlan([], planIngest([rec('SMD/2026/0280')], []))
  const decided = planIngest([rec('SMD/2026/0280', { status: 'Permitted', decision_date: '2026-09-10' })], store)
  assert.equal(decided.writes.length, 1)
  assert.deepEqual(decided.writes[0].changes.map((c) => c.field).sort(), ['decision_date', 'status'])
  store = applyPlan(store, decided)
  const again = planIngest([rec('SMD/2026/0280', { status: 'Permitted', decision_date: '2026-09-10' })], store)
  assert.equal(again.writes.length, 0)
})

test('rows stored before content hashing are rewritten once without inventing history', () => {
  const legacy: StoredRecord = { id: 'id-1', council_slug: 'staffordshire-moorlands', reference: 'SMD/2026/0280', content_hash: null, values: values({ source_url: null }) }
  const plan = planIngest([rec('SMD/2026/0280')], [legacy])
  assert.equal(plan.writes.length, 1)
  assert.deepEqual(plan.writes[0].changes, [])
  const again = planIngest([rec('SMD/2026/0280')], applyPlan([legacy], plan))
  assert.equal(again.writes.length, 0)
})
