// =============================================================================
// Backfill route — score existing applications.
//
// This is the "run scoring over current data" tool. It is SEPARATE from the
// scraper on purpose: scoring is a prototype layer we can delete without
// touching ingestion. Call it manually whenever you change civilsCriteria.ts
// and want to re-score everything.
//
// Usage (re-score is safe to repeat):
//   # Only rows that have never been scored:
//   curl -H "x-webhook-secret: $WEBHOOK_SECRET" https://<host>/api/score
//   # Re-score EVERYTHING (after editing the criteria):
//   curl -H "x-webhook-secret: $WEBHOOK_SECRET" "https://<host>/api/score?all=1"
//
// Auth reuses WEBHOOK_SECRET — no new secret to manage for a prototype.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { scoreApplication } from '@/lib/scoring/scoreApplication'

export const maxDuration = 300

export async function GET(request: NextRequest) {
  // Reuse the webhook secret for auth — keeps prototype surface area small.
  const secret = request.headers.get('x-webhook-secret')
  if (!secret || secret !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  // ?all=1 re-scores every row; default only scores rows with no band yet.
  const rescoreAll = new URL(request.url).searchParams.get('all') === '1'

  const supabase = createAdminClient()

  let query = supabase
    .from('planning_applications')
    .select('id, reference, description, address')
  if (!rescoreAll) query = query.is('band', null)

  const { data: rows, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (!rows || rows.length === 0) {
    return NextResponse.json({ scored: 0, message: 'Nothing to score.' })
  }

  // Score in memory, then write back one row at a time. Fine for prototype
  // volumes; revisit with a bulk update if the table gets large.
  const counts: Record<string, number> = { HOT: 0, WARM: 0, COLD: 0 }
  let failures = 0

  for (const row of rows) {
    const { score, band, matchedReasons } = scoreApplication(row)
    counts[band]++

    const { error: updateErr } = await supabase
      .from('planning_applications')
      .update({ score, band, score_reasons: matchedReasons })
      .eq('id', row.id)

    if (updateErr) {
      console.error(`Score update failed for ${row.id}:`, updateErr.message)
      failures++
    }
  }

  return NextResponse.json({
    scored: rows.length - failures,
    failures,
    bands: counts,
    rescored_all: rescoreAll,
  })
}
