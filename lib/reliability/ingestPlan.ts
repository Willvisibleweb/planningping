// The decision half of the ingest, with no database in it.
//
// Given what arrived from the source and what is already stored, decide which
// rows to write, which are unchanged, what changed on each, and which incoming
// records were the same application twice. upsertApplications does the I/O and
// the scoring around this; keeping the decisions pure is what makes the two
// properties that matter provable in a test:
//
//   idempotent — feeding the same records in twice writes nothing the second
//     time and records no change;
//   overlap-safe — a backfill window that overlaps one already ingested
//     cannot create a second row for an application, because the identity is
//     authority + reference, and a reference differing only in spacing or
//     case resolves to the stored one.

import { canonicalReference, normaliseReference } from './duplicates.ts'
import { contentHash, diffTrackedFields, mergeSticky, type FieldChange, type TrackedValues } from './sourceChanges.ts'

export interface IncomingRecord {
  council_slug: string
  reference: string
  values: TrackedValues
}

export interface StoredRecord {
  id: string
  council_slug: string
  reference: string
  content_hash: string | null
  values: TrackedValues
}

export interface PlannedWrite {
  council_slug: string
  /** The reference to write under — the stored spelling when one exists. */
  reference: string
  incomingReference: string
  values: TrackedValues
  contentHash: string
  isNew: boolean
  previous: StoredRecord | null
  changes: FieldChange[]
}

export interface IngestPlan {
  writes: PlannedWrite[]
  unchanged: Array<{ id: string; council_slug: string; reference: string }>
  /** Incoming records that were the same application as one earlier in the batch. */
  collapsedInBatch: number
  /** Incoming references mapped onto a stored spelling (spacing/case variants). */
  referenceVariantsResolved: number
}

export function planIngest(incoming: IncomingRecord[], stored: StoredRecord[]): IngestPlan {
  const storedByCouncil = new Map<string, Map<string, StoredRecord>>()
  for (const s of stored) {
    const byRef = storedByCouncil.get(s.council_slug) ?? new Map<string, StoredRecord>()
    byRef.set(s.reference, s)
    storedByCouncil.set(s.council_slug, byRef)
  }

  const writes: PlannedWrite[] = []
  const unchanged: IngestPlan['unchanged'] = []
  const seen = new Set<string>()
  let collapsedInBatch = 0
  let referenceVariantsResolved = 0

  for (const record of incoming) {
    if (!record.reference?.trim() || !record.council_slug) continue
    const batchKey = `${record.council_slug}|${normaliseReference(record.reference)}`
    if (seen.has(batchKey)) {
      collapsedInBatch++
      continue
    }
    seen.add(batchKey)

    const councilStored = storedByCouncil.get(record.council_slug) ?? new Map<string, StoredRecord>()
    const reference = canonicalReference(record.reference, councilStored.keys())
    if (reference !== record.reference) referenceVariantsResolved++
    const previous = councilStored.get(reference) ?? null

    const values = mergeSticky(previous?.values ?? null, record.values)
    const hash = contentHash(values)

    if (previous && previous.content_hash === hash) {
      unchanged.push({ id: previous.id, council_slug: record.council_slug, reference })
      continue
    }

    writes.push({
      council_slug: record.council_slug,
      reference,
      incomingReference: record.reference,
      values,
      contentHash: hash,
      isNew: previous === null,
      previous,
      changes: previous ? diffTrackedFields(previous.values, values) : [],
    })
  }

  return { writes, unchanged, collapsedInBatch, referenceVariantsResolved }
}
