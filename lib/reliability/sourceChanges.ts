// What changed on an application between two source readings.
//
// The ingest used to decide "changed" from status + decision date alone, so a
// council revising a description, an address or the agent never reached the
// database at all. This compares every source fact we store, keeps a change
// log of the ones that matter, and hashes the lot so an unchanged record costs
// one string comparison.
//
// Two fields were added to the schema long after ingestion began (agent and
// target decision date), and the source link arrived with the PlanIt switch.
// A null-to-value move on those is our catching up, not the authority
// changing anything, so it is not recorded as a change. And a value-to-null
// move on the agent or target date is treated as the source withholding it
// this time, not as the value being wrong — the known value is kept.

import { createHash } from 'node:crypto'
import { normaliseUrl } from './duplicates.ts'

export const TRACKED_FIELDS = [
  'status',
  'decision_date',
  'description',
  'address',
  'agent_company',
  'target_decision_date',
  'application_date',
  'app_type',
  'source_url',
] as const

export type TrackedField = (typeof TRACKED_FIELDS)[number]
export type TrackedValues = Record<TrackedField, string | null>

/** Fields whose null-to-value transition is backfill, not a source change. */
export const LATE_ADDED_FIELDS: ReadonlySet<TrackedField> = new Set(['agent_company', 'target_decision_date', 'app_type', 'source_url'])
/** Fields where a known value is kept if the source later omits it. */
export const STICKY_FIELDS: ReadonlySet<TrackedField> = new Set(['agent_company', 'target_decision_date'])

export function normaliseValue(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  const t = String(value).replace(/\s+/g, ' ').trim()
  return t.length > 0 ? t : null
}

// The same council page can come back with its query parameters in a
// different order, or the host in different case. Measured on Leeds: 83 links
// "changed" in one dry run without pointing anywhere new. Compared by what
// they address, not by their spelling.
function comparable(field: TrackedField, value: string | null | undefined): string | null {
  const v = normaliseValue(value)
  if (v === null) return null
  return field === 'source_url' ? normaliseUrl(v) : v
}

export function contentHash(values: TrackedValues): string {
  const parts = TRACKED_FIELDS.map((f) => `${f}=${comparable(f, values[f]) ?? ''}`)
  return createHash('sha256').update(parts.join('␟')).digest('hex')
}

/** Incoming values with sticky fields filled from what we already hold. */
export function mergeSticky(previous: TrackedValues | null, incoming: TrackedValues): TrackedValues {
  if (!previous) return incoming
  const merged = { ...incoming }
  for (const field of STICKY_FIELDS) {
    if (normaliseValue(merged[field]) === null && normaliseValue(previous[field]) !== null) {
      merged[field] = previous[field]
    }
  }
  return merged
}

export interface FieldChange {
  field: TrackedField
  old_value: string | null
  new_value: string | null
}

// Case is compared loosely for the change log: the retired scraper title-cased
// addresses and some councils flip "Awaiting Decision" to "Awaiting decision".
// Neither is the authority changing anything, and a history full of them would
// bury the changes that are real. (The row itself still takes the new text.)
function sameForHistory(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b
  return a.toLowerCase() === b.toLowerCase()
}

export function diffTrackedFields(previous: TrackedValues, next: TrackedValues): FieldChange[] {
  const changes: FieldChange[] = []
  for (const field of TRACKED_FIELDS) {
    const before = normaliseValue(previous[field])
    const after = normaliseValue(next[field])
    if (sameForHistory(comparable(field, before), comparable(field, after))) continue
    if (before === null && LATE_ADDED_FIELDS.has(field)) continue
    if (after === null && STICKY_FIELDS.has(field)) continue
    changes.push({ field, old_value: before, new_value: after })
  }
  return changes
}
