// One-off history backfill.
//
// The daily ingest looks back 30 days, so history only ever accumulates
// forward from the day a territory was added and never fills in behind it.
// Measured: Staffordshire Moorlands holds 130 applications here against 852
// available on PlanIt for the last twelve months. A demo of a product whose
// pitch is "find work early" looking three months old is a bad demo.
//
// Walks each active territory backwards a month at a time, at that territory's
// own radius — verified that PlanIt honours pcode, krad and a date range
// together, and that the radius still applies within the window (same postcode
// and window returns 19 at 5km, 7 at 1km).
//
// Resumable, which is the difference between a one-off script and something
// that still works at scale. Each territory records how far back it has been
// taken, and a run picks up the least-progressed first — so the job can be
// called repeatedly and grinds through however many territories exist. Without
// that it restarts at month one every run: invisible at nine territories, fatal
// past about thirty, and silent either way because every run reports success.
//
// Safe to call repeatedly. Once every territory is complete it does almost
// nothing, so it can be scheduled or left manual without waste.
//
//   curl -H "Authorization: Bearer $CRON_SECRET" \
//        "https://planningping.com/api/cron/backfill-history?months=12"

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchNearby, slugifyAuthority } from '@/lib/planit'
import { upsertApplications, type IngestApplication } from '@/lib/ingest/upsertApplications'

export const maxDuration = 300

const DEFAULT_MONTHS = 12
const MAX_MONTHS = 24
const DELAY_MS = 1500          // PlanIt is free and shared
const DEADLINE_MS = 240_000    // well inside maxDuration
const MIN_RADIUS_KM = 0.5

function monthWindow(monthsAgo: number): { start: string; end: string } {
  const end = new Date()
  end.setUTCMonth(end.getUTCMonth() - monthsAgo, 1)
  const start = new Date(end)
  start.setUTCMonth(start.getUTCMonth() - 1)
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) }
}

export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const months = Math.min(
    Math.max(Number(request.nextUrl.searchParams.get('months')) || DEFAULT_MONTHS, 1),
    MAX_MONTHS,
  )

  const supabase = createAdminClient()
  const startedAt = Date.now()

  // Least-progressed first, nulls before anything. Same ordering the daily
  // ingest uses on last_planit_fetch_at, for the same reason: a fixed order
  // starves whatever sits at the back.
  const { data: areas } = await supabase
    .from('tracked_areas')
    .select('id, postcode, radius_metres, council_slug, history_backfilled_through')
    .eq('is_active', true)
    .order('history_backfilled_through', { ascending: false, nullsFirst: true })

  const rows = (areas ?? []) as {
    id: string
    postcode: string
    radius_metres: number | null
    council_slug: string
    history_backfilled_through: string | null
  }[]

  // Collapse duplicate postcode+radius pairs. Several accounts track the same
  // place, and fetching it once per account would multiply PlanIt's load for
  // identical results.
  const seen = new Set<string>()
  const targets = rows.filter((r) => {
    const km = Math.max((r.radius_metres ?? 1000) / 1000, MIN_RADIUS_KM)
    const key = `${r.postcode}|${km}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  // The oldest month this run will reach. A territory already backfilled to or
  // beyond it has nothing left to do and is skipped entirely rather than
  // re-fetched — which is what makes repeated calls cheap.
  const horizon = monthWindow(months).start

  const report: Record<
    string,
    { fetched: number; stored: number; windows: number; skipped?: string }
  > = {}
  let stoppedEarly = false
  let totalStored = 0

  // Council resolution mirrors the daily ingest: PlanIt names the authority,
  // we key on our own slug.
  const { data: councilRows } = await supabase.from('councils').select('slug, name')
  const nameToSlug = new Map<string, string>()
  for (const c of (councilRows ?? []) as { slug: string; name: string }[]) {
    nameToSlug.set(c.name.toLowerCase(), c.slug)
  }

  outer: for (const area of targets) {
    const km = Math.max((area.radius_metres ?? 1000) / 1000, MIN_RADIUS_KM)
    const key = `${area.postcode} @ ${km}km`

    if (area.history_backfilled_through && area.history_backfilled_through <= horizon) {
      report[key] = { fetched: 0, stored: 0, windows: 0, skipped: 'already complete' }
      continue
    }

    const stats = report[key] ?? { fetched: 0, stored: 0, windows: 0 }
    report[key] = stats

    // Backwards from the most recent month, so a run that runs out of time has
    // filled in the nearest history rather than the oldest — recent gaps matter
    // more to a user than 2024 does.
    for (let m = 1; m <= months; m++) {
      if (Date.now() - startedAt > DEADLINE_MS) { stoppedEarly = true; break outer }

      const { start, end } = monthWindow(m)
      try {
        const apps = await fetchNearby({
          postcode: area.postcode,
          radiusKm: km,
          recentDays: 30, // ignored when a date range is supplied
          startDate: start,
          endDate: end,
          pageSize: 400,
        })
        stats.windows++
        stats.fetched += apps.length

        if (apps.length > 0) {
          const toIngest: IngestApplication[] = apps.map((app) => ({
            council_slug:
              nameToSlug.get(app.councilName.toLowerCase()) ?? slugifyAuthority(app.councilName),
            reference: app.reference,
            address: app.address,
            description: app.description,
            status: app.status,
            application_date: app.applicationDate,
            decision_date: app.decisionDate,
            agent_company: app.agentCompany,
            target_decision_date: app.targetDecisionDate,
            raw_data: {
              source: 'planit', url: app.url, app_type: app.appType,
              lat: app.lat, lng: app.lng,
            },
          }))

          // Same upsert as the daily run, so backfilled rows are scored on the
          // way in and are indistinguishable from live ones afterwards.
          const result = await upsertApplications(supabase, toIngest)
          stats.stored += result.changed
          totalStored += result.changed
        }
      } catch {
        // One bad window must not end the run. PlanIt intermittently 502s and
        // hangs; the window is simply missing and a later run can pick it up.
      }

      // Recorded after each window rather than at the end of the territory, so
      // a run killed mid-territory still keeps what it achieved. Written on the
      // area row that produced this fetch and on any sibling sharing the same
      // postcode and radius, since the dedupe above means one fetch covers all
      // of them and leaving siblings null would re-fetch identical data.
      await supabase
        .from('tracked_areas')
        .update({ history_backfilled_through: start })
        .eq('postcode', area.postcode)
        .eq('is_active', true)
        .or(`history_backfilled_through.is.null,history_backfilled_through.gt.${start}`)

      await new Promise((r) => setTimeout(r, DELAY_MS))
    }
  }

  return NextResponse.json({
    ran_at: new Date().toISOString(),
    months,
    territories: targets.length,
    stored: totalStored,
    stoppedEarly,
    report,
  })
}
