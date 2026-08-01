// PlanIt ingestion — the replacement for the Idox scraper.
//
// For each active tracked area, ask PlanIt for recent applications within the
// area's radius, resolve each result's council, and upsert (with inline
// scoring). Runs on a Vercel Cron via the CRON_SECRET bearer token; can also be
// invoked manually with the same header for testing.
//
// This does NOT send digests — it only keeps planning_applications fresh. The
// digest step is migrated separately; n8n stays untouched until this is proven.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchNearby, slugifyAuthority } from '@/lib/planit'
import { upsertApplications, type IngestApplication } from '@/lib/ingest/upsertApplications'

export const maxDuration = 300

const RECENT_DAYS = 30
const MIN_RADIUS_KM = 0.5
const DELAY_MS = 1500 // be polite to PlanIt's rate limiter between area queries

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  const { data: areas, error } = await supabase
    .from('tracked_areas')
    .select('postcode, radius_metres')
    .eq('is_active', true)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // council resolver: PlanIt area_name -> our council_slug (by councils.name),
  // auto-onboarding any authority we don't have yet.
  const { data: councilRows } = await supabase.from('councils').select('slug, name')
  const nameToSlug = new Map<string, string>()
  for (const c of (councilRows ?? []) as { slug: string; name: string }[]) {
    nameToSlug.set(c.name.toLowerCase(), c.slug)
  }
  async function resolveSlug(areaName: string): Promise<string> {
    const key = areaName.toLowerCase()
    const found = nameToSlug.get(key)
    if (found) return found
    const slug = slugifyAuthority(areaName)
    await supabase
      .from('councils')
      .upsert({ slug, name: areaName, supported: true }, { onConflict: 'slug', ignoreDuplicates: true })
    nameToSlug.set(key, slug)
    return slug
  }

  // Collapse duplicate postcode+radius queries.
  const seen = new Set<string>()
  const queries: { postcode: string; km: number }[] = []
  for (const a of (areas ?? []) as { postcode: string; radius_metres: number | null }[]) {
    const km = Math.max((a.radius_metres ?? 800) / 1000, MIN_RADIUS_KM)
    const key = `${a.postcode}|${km}`
    if (seen.has(key)) continue
    seen.add(key)
    queries.push({ postcode: a.postcode, km })
  }

  const collected: IngestApplication[] = []
  const perArea: Array<{ postcode: string; fetched: number; error?: string }> = []

  for (const q of queries) {
    try {
      const apps = await fetchNearby({ postcode: q.postcode, radiusKm: q.km, recentDays: RECENT_DAYS })
      for (const app of apps) {
        collected.push({
          council_slug: await resolveSlug(app.councilName),
          reference: app.reference,
          address: app.address,
          description: app.description,
          status: app.status,
          application_date: app.applicationDate,
          decision_date: app.decisionDate,
          raw_data: {
            source: 'planit',
            url: app.url,
            app_type: app.appType,
            lat: app.lat,
            lng: app.lng,
          },
        })
      }
      perArea.push({ postcode: q.postcode, fetched: apps.length })
    } catch (e) {
      perArea.push({ postcode: q.postcode, fetched: 0, error: String(e) })
    }
    await new Promise((r) => setTimeout(r, DELAY_MS))
  }

  const result = await upsertApplications(supabase, collected)

  return NextResponse.json({
    ran_at: new Date().toISOString(),
    source: 'planit',
    areas_queried: queries.length,
    applications_fetched: collected.length,
    changed: result.changed,
    new: result.new_refs.length,
    per_area: perArea,
  })
}
