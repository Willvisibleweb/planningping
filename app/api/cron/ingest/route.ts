// PlanIt ingestion — the replacement for the Idox scraper.
//
// For each active tracked area, ask PlanIt for recent applications within the
// area's radius, resolve each result's council, and upsert (with inline
// scoring). Runs on a Vercel Cron via the CRON_SECRET bearer token; can also be
// invoked manually with the same header for testing.
//
// This route also sends a batched alert email, once per run, to any
// professional user with alerts_enabled on a territory that just surfaced a
// genuinely new, relevance-filtered application — see the fan-out below.
// Note it is gated on hasProAccess, so homeowner accounts receive no email
// from this path at all.
//
// The weekly digest is NOT sent from here, and is currently not sent by
// anything. This comment used to say it was "still sent separately by n8n,
// untouched" — that stopped being true when n8n was replaced by this Vercel
// cron, and the digests table has never had a row written to it. Several
// pages still describe a Monday digest to customers; that copy becomes true
// when the digest job is built, and should be checked against reality if it
// isn't.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchNearby, slugifyAuthority } from '@/lib/planit'
import { upsertApplications, type IngestApplication } from '@/lib/ingest/upsertApplications'
import { resolveDischargeParents } from '@/lib/ingest/resolveDischargeParents'
import { flagStaleDischarges } from '@/lib/ingest/flagStaleDischarges'
import { sendDischargeAlerts } from '@/lib/alerts/dischargeAlerts'
import { hasProAccess } from '@/lib/access'
import { sendAlertEmail, type AlertItem } from '@/lib/email'
import type { Profile, MinBand } from '@/types/database'

export const maxDuration = 300

const RECENT_DAYS = 30
const MIN_RADIUS_KM = 0.5
const DELAY_MS = 1500 // be polite to PlanIt's rate limiter between area queries
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://planningping.com'

interface AreaRow {
  id: string
  user_id: string
  postcode: string
  radius_metres: number | null
  alerts_enabled: boolean
  min_band: MinBand
  label: string
}

// Does this application's band clear the territory's relevance filter?
function clearsBand(band: string | null, minBand: MinBand): boolean {
  if (minBand === 'ALL') return true
  if (minBand === 'WARM_PLUS') return band === 'HOT' || band === 'WARM'
  return band === 'HOT' // HOT_ONLY
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  const { data: areas, error } = await supabase
    .from('tracked_areas')
    .select('id, user_id, postcode, radius_metres, alerts_enabled, min_band, label')
    .eq('is_active', true)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const areaRows = (areas ?? []) as AreaRow[]

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

  // Collapse duplicate postcode+radius queries, but keep every tracked_area
  // that shares a query key — that's the alert fan-out's attribution seam:
  // PlanIt's own radius search already tells us who's covered, no need to
  // reimplement distance matching.
  const seen = new Set<string>()
  const queries: { postcode: string; km: number }[] = []
  const queryKeyToAreas = new Map<string, AreaRow[]>()
  for (const a of areaRows) {
    const km = Math.max((a.radius_metres ?? 800) / 1000, MIN_RADIUS_KM)
    const key = `${a.postcode}|${km}`
    const list = queryKeyToAreas.get(key) ?? []
    list.push(a)
    queryKeyToAreas.set(key, list)
    if (seen.has(key)) continue
    seen.add(key)
    queries.push({ postcode: a.postcode, km })
  }

  const collected: IngestApplication[] = []
  const perArea: Array<{ postcode: string; fetched: number; error?: string }> = []
  // Every fetched app (not just new ones — newness isn't known until after
  // upsert), keyed by the query that surfaced it.
  const queryKeyToApps = new Map<string, { council_slug: string; reference: string }[]>()

  for (const q of queries) {
    const queryKey = `${q.postcode}|${q.km}`
    try {
      const apps = await fetchNearby({ postcode: q.postcode, radiusKm: q.km, recentDays: RECENT_DAYS })
      const appList = queryKeyToApps.get(queryKey) ?? []
      for (const app of apps) {
        const council_slug = await resolveSlug(app.councilName)
        collected.push({
          council_slug,
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
        appList.push({ council_slug, reference: app.reference })
      }
      queryKeyToApps.set(queryKey, appList)
      perArea.push({ postcode: q.postcode, fetched: apps.length })
    } catch (e) {
      perArea.push({ postcode: q.postcode, fetched: 0, error: String(e) })
    }
    await new Promise((r) => setTimeout(r, DELAY_MS))
  }

  const result = await upsertApplications(supabase, collected)

  const alertsSent = await sendBatchedAlerts(supabase, {
    queryKeyToAreas,
    queryKeyToApps,
    newApplications: result.new_applications,
  })

  // Discharge-of-condition: a separate, independent fan-out (tracked_leads,
  // not tracked_areas — see lib/alerts/dischargeAlerts.ts). Parent-ID
  // resolution runs every tick (a discharge row's parent is often ingested
  // on a later run), then stale-flagging, then the alert itself reads both.
  const resolvedParents = await resolveDischargeParents(supabase)
  const newlyStaleDischarges = await flagStaleDischarges(supabase)
  const dischargeAlertsSent = await sendDischargeAlerts(supabase, {
    newApplications: result.new_applications,
    staleRows: newlyStaleDischarges,
    siteUrl: SITE_URL,
  })

  return NextResponse.json({
    ran_at: new Date().toISOString(),
    source: 'planit',
    areas_queried: queries.length,
    applications_fetched: collected.length,
    changed: result.changed,
    new: result.new_refs.length,
    alerts_sent: alertsSent,
    discharge_parents_resolved: resolvedParents,
    discharge_newly_stale: newlyStaleDischarges.length,
    discharge_alerts_sent: dischargeAlertsSent,
    per_area: perArea,
  })
}

// Fan-out: for every genuinely new application, find every tracked_area that
// actually surfaced it (via the query-key attribution above), gate through
// alerts_enabled / relevance filter / pro access / dedup, then send one
// batched email per user covering everything they qualify for this run.
async function sendBatchedAlerts(
  supabase: ReturnType<typeof createAdminClient>,
  opts: {
    queryKeyToAreas: Map<string, AreaRow[]>
    queryKeyToApps: Map<string, { council_slug: string; reference: string }[]>
    newApplications: Awaited<ReturnType<typeof upsertApplications>>['new_applications']
  },
): Promise<number> {
  const newByKey = new Map(opts.newApplications.map((a) => [`${a.council_slug}|${a.reference}`, a]))
  if (newByKey.size === 0) return 0

  // user_id -> { area, item }[] — everything this user qualifies for this run.
  const hitsByUser = new Map<string, { area: AreaRow; item: AlertItem }[]>()

  for (const [queryKey, areasForKey] of opts.queryKeyToAreas) {
    const apps = opts.queryKeyToApps.get(queryKey) ?? []
    for (const alertArea of areasForKey) {
      if (!alertArea.alerts_enabled) continue
      for (const app of apps) {
        const newApp = newByKey.get(`${app.council_slug}|${app.reference}`)
        if (!newApp) continue
        if (!clearsBand(newApp.band, alertArea.min_band)) continue
        const list = hitsByUser.get(alertArea.user_id) ?? []
        list.push({
          area: alertArea,
          item: {
            areaLabel: alertArea.label,
            reference: newApp.reference,
            band: newApp.band,
            description: newApp.description,
            address: newApp.address,
            councilSlug: newApp.council_slug,
          },
        })
        hitsByUser.set(alertArea.user_id, list)
      }
    }
  }
  if (hitsByUser.size === 0) return 0

  const userIds = [...hitsByUser.keys()]
  const { data: profiles } = await supabase.from('profiles').select('*').in('id', userIds)
  const profileById = new Map((profiles ?? []).map((p) => [(p as Profile).id, p as Profile]))

  let sentCount = 0
  const logRows: { user_id: string; tracked_area_id: string; council_slug: string; reference: string }[] = []

  for (const [userId, hits] of hitsByUser) {
    const profile = profileById.get(userId) ?? null
    if (!hasProAccess(profile)) continue

    const items = hits.map((h) => h.item)
    const sent = await sendAlertEmail({ to: profile!.email, items, siteUrl: SITE_URL })
    if (!sent) continue

    sentCount++
    for (const h of hits) {
      logRows.push({
        user_id: userId,
        tracked_area_id: h.area.id,
        council_slug: h.item.councilSlug,
        reference: h.item.reference,
      })
    }
  }

  if (logRows.length > 0) {
    await supabase
      .from('email_alert_log')
      .upsert(logRows, { onConflict: 'tracked_area_id,council_slug,reference', ignoreDuplicates: true })
  }

  return sentCount
}
