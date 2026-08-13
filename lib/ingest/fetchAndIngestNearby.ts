// Shared "fetch one postcode from PlanIt, provision any council it surfaces,
// upsert the results" step. Used by addTrackedArea (fetch on add) and the
// territory radius-update action (re-fetch after the radius changes) — same
// round-trip, same auto-provisioning, same inline scoring on upsert.

import { fetchNearby, slugifyAuthority } from '@/lib/planit'
import { upsertApplications, type IngestApplication } from '@/lib/ingest/upsertApplications'
import type { createAdminClient } from '@/lib/supabase/admin'

type AdminClient = ReturnType<typeof createAdminClient>

const RECENT_DAYS = 30
const MIN_RADIUS_KM = 0.5

// If the primary council was fetched from PlanIt more recently than this
// (from ANY source — the national backfill, the daily ingest cron, or
// another user's instant fetch), skip calling PlanIt again. Real-user actions
// (add area / change radius) are the one load source not paced by a cron
// schedule, so this is what keeps them polite as usage grows — without it,
// N users adding territories in the same well-covered council in quick
// succession would fire N redundant PlanIt requests for data we already have.
const FRESHNESS_WINDOW_MS = 2 * 60 * 60 * 1000 // 2 hours

// Best-effort: returns null on failure rather than throwing, so callers can
// treat a PlanIt hiccup as non-fatal (the daily cron will catch it later).
export async function fetchAndIngestNearby(
  admin: AdminClient,
  postcode: string,
  radiusMetres: number,
  primaryCouncilSlug: string,
): Promise<{ fetched: number; changed: number; skipped?: boolean } | null> {
  try {
    const { data: councilRow } = await admin
      .from('councils')
      .select('last_planit_fetch_at')
      .eq('slug', primaryCouncilSlug)
      .maybeSingle()

    const lastFetchMs = councilRow?.last_planit_fetch_at
      ? new Date(councilRow.last_planit_fetch_at as string).getTime()
      : 0
    if (Date.now() - lastFetchMs < FRESHNESS_WINDOW_MS) {
      return { fetched: 0, changed: 0, skipped: true }
    }

    const radiusKm = Math.max(radiusMetres / 1000, MIN_RADIUS_KM)
    const nearby = await fetchNearby({ postcode, radiusKm, recentDays: RECENT_DAYS })

    // A radius search can surface neighbouring authorities beyond the primary
    // one (e.g. near a border) — provision those too, not just the primary.
    const otherCouncils = [...new Set(nearby.map((a) => a.councilName))].filter(
      (n) => slugifyAuthority(n) !== primaryCouncilSlug,
    )
    if (otherCouncils.length > 0) {
      await admin.from('councils').upsert(
        otherCouncils.map((name) => ({ slug: slugifyAuthority(name), name, supported: true })),
        { onConflict: 'slug', ignoreDuplicates: true },
      )
    }

    const toIngest: IngestApplication[] = nearby.map((app) => ({
      council_slug: slugifyAuthority(app.councilName),
      reference: app.reference,
      address: app.address,
      description: app.description,
      status: app.status,
      application_date: app.applicationDate,
      decision_date: app.decisionDate,
      agent_company: app.agentCompany,
      target_decision_date: app.targetDecisionDate,
      raw_data: { source: 'planit', url: app.url, app_type: app.appType, lat: app.lat, lng: app.lng },
    }))

    // Stamp freshness for every council this query actually touched, so the
    // skip check above (and the next backfill run's ordering) sees it.
    const touchedSlugs = [...new Set([primaryCouncilSlug, ...nearby.map((a) => slugifyAuthority(a.councilName))])]
    await admin
      .from('councils')
      .update({ last_planit_fetch_at: new Date().toISOString() })
      .in('slug', touchedSlugs)

    if (toIngest.length === 0) return { fetched: 0, changed: 0 }

    const result = await upsertApplications(admin, toIngest)
    return { fetched: nearby.length, changed: result.changed }
  } catch (e) {
    console.error('fetchAndIngestNearby failed (non-fatal):', e)
    return null
  }
}
