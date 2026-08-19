// Storing tenders.
//
// Folded into the existing daily ingest rather than given its own cron. It is
// one HTTP call and a single upsert against a few dozen rows, so it costs a
// couple of seconds inside a run that already has a 200-second budget — and it
// spares another external scheduler entry to configure, forget, and later
// discover has silently stopped.

import { fetchRecentTenders, outwardCode } from './contractsFinder'
import type { SupabaseClient } from '@supabase/supabase-js'

// Overlaps deliberately. Contracts Finder amends and republishes notices, and a
// window that only covered since-last-run would miss an amendment landing a
// minute after a run finished. Re-reading a week each day is cheap because the
// upsert makes it idempotent.
const LOOKBACK_DAYS = 7

export interface TenderIngestResult {
  fetched: number
  stored: number
  error?: string
}

export async function ingestTenders(admin: SupabaseClient): Promise<TenderIngestResult> {
  const from = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10)

  const tenders = await fetchRecentTenders(from)
  if (tenders.length === 0) {
    // Genuinely common: four or five usable notices a day nationally means a
    // quiet day returns nothing, and that is not an error worth flagging.
    return { fetched: 0, stored: 0 }
  }

  // Deduplicate by ocid before upserting.
  //
  // Contracts Finder returns the same ocid more than once in a single response
  // — a notice and its amendments both appear — and Postgres rejects an upsert
  // whose batch touches one key twice: "ON CONFLICT DO UPDATE command cannot
  // affect row a second time". That fails the entire batch, not the duplicate,
  // so nineteen tenders stored zero.
  //
  // The newest publication wins, since an amendment is the current truth about
  // that contract. Ties keep the later position, which is the order the API
  // returned them in.
  const newest = new Map<string, (typeof tenders)[number]>()
  for (const t of tenders) {
    const existing = newest.get(t.ocid)
    if (!existing || (t.publishedAt ?? '') >= (existing.publishedAt ?? '')) {
      newest.set(t.ocid, t)
    }
  }
  const deduped = [...newest.values()]

  const rows = deduped.map((t) => ({
    ocid: t.ocid,
    title: t.title,
    description: t.description,
    buyer: t.buyer,
    value_gbp: t.valueGbp,
    classification: t.classification,
    postcode: t.postcode,
    outward_code: t.postcode ? outwardCode(t.postcode) : null,
    published_at: t.publishedAt,
    closes_at: t.closesAt,
    url: t.url,
    updated_at: new Date().toISOString(),
  }))

  // Upsert on ocid so an amended notice updates in place rather than
  // accumulating near-duplicates of the same contract.
  const { error, count } = await admin
    .from('tenders')
    .upsert(rows, { onConflict: 'ocid', count: 'exact' })

  if (error) return { fetched: tenders.length, stored: 0, error: error.message }
  return { fetched: tenders.length, stored: count ?? rows.length }
}
