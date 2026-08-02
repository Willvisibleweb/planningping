// National council backfill — proactively pulls data for UK planning
// authorities PlanIt covers, rather than waiting for a user to be the first
// to track a postcode near one. Runs on its own daily schedule, separate from
// /api/cron/ingest, and processes a bounded batch per run (not all ~420 at
// once) so it never risks tripping PlanIt's rate limit or overlapping load
// with the regular ingest cron.
//
// Self-balancing: each run picks the least-recently-backfilled councils
// first (last_planit_fetch_at, migration 0011), so it naturally cycles through
// every authority over time and revisits stale ones before fresh ones.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchByAuthority, fetchAuthorityList, slugifyAuthority } from '@/lib/planit'
import { upsertApplications, type IngestApplication } from '@/lib/ingest/upsertApplications'

export const maxDuration = 300

const RECENT_DAYS = 30
// Sized against maxDuration=300s with the background-batch retry budget in
// lib/planit.ts (2 attempts, 4s backoff cap): worst case per council is
// ~DELAY_MS + one retry, so 15 * (2s + ~11s worst case) = ~195s, comfortably
// inside the limit even if several councils hit a 429 in the same run.
const BATCH_SIZE = 15
const DELAY_MS = 2000 // more conservative than the ingest cron's 1.5s — this is bonus background growth, not core product freshness

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // Self-healing: make sure every PlanIt authority has a councils row, so the
  // batch selection below has something to iterate over even for authorities
  // no user has ever searched near. Cheap — one PlanIt request regardless of
  // batch size, and also picks up any new authority PlanIt adds over time.
  const allAuthorities = await fetchAuthorityList()
  if (allAuthorities.length > 0) {
    await supabase.from('councils').upsert(
      allAuthorities.map((name) => ({ slug: slugifyAuthority(name), name, supported: true })),
      { onConflict: 'slug', ignoreDuplicates: true },
    )
  }

  const { data: batch, error } = await supabase
    .from('councils')
    .select('slug, name')
    .eq('supported', true)
    .order('last_planit_fetch_at', { ascending: true, nullsFirst: true })
    .limit(BATCH_SIZE)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!batch || batch.length === 0) {
    return NextResponse.json({ message: 'No councils to backfill', total_authorities: allAuthorities.length })
  }

  const results: Array<{ council: string; fetched: number; changed: number; error?: string }> = []

  for (const council of batch) {
    try {
      const apps = await fetchByAuthority({ authorityName: council.name, recentDays: RECENT_DAYS })
      const toIngest: IngestApplication[] = apps.map((app) => ({
        council_slug: slugifyAuthority(app.councilName),
        reference: app.reference,
        address: app.address,
        description: app.description,
        status: app.status,
        application_date: app.applicationDate,
        decision_date: app.decisionDate,
        raw_data: { source: 'planit', url: app.url, app_type: app.appType, lat: app.lat, lng: app.lng },
      }))
      const { changed } = await upsertApplications(supabase, toIngest)
      results.push({ council: council.name, fetched: apps.length, changed })
    } catch (e) {
      results.push({ council: council.name, fetched: 0, changed: 0, error: String(e) })
    }
    // Stamp last_planit_fetch_at regardless of success/failure — a persistently
    // erroring council (e.g. PlanIt has no data for it) must not stay at the
    // front of the queue forever and block the rest of the rotation.
    await supabase.from('councils').update({ last_planit_fetch_at: new Date().toISOString() }).eq('slug', council.slug)
    await new Promise((r) => setTimeout(r, DELAY_MS))
  }

  return NextResponse.json({
    ran_at: new Date().toISOString(),
    total_authorities: allAuthorities.length,
    batch_size: batch.length,
    results,
  })
}
