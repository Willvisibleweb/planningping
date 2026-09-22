// Shared "fetch one postcode from PlanIt, provision any council it surfaces,
// upsert the results" step. Used by addTrackedArea (fetch on add) and the
// territory radius-update action (re-fetch after the radius changes) — same
// round-trip, same auto-provisioning, same inline scoring on upsert.

import { queryPlanIt, PlanItError } from '@/lib/planit'
import { fromPlanIt, upsertApplications } from '@/lib/ingest/upsertApplications'
import { createCouncilResolver } from '@/lib/ingest/councilResolver'
import { areaSourceKey } from '@/lib/reliability/sourceKeys'
import { logPipelineEvent, recordSourceRun } from '@/lib/reliability/pipelineLog'
import type { createAdminClient } from '@/lib/supabase/admin'

type AdminClient = ReturnType<typeof createAdminClient>

const RECENT_DAYS = 30
const MIN_RADIUS_KM = 0.5

// If the primary council was fetched from PlanIt successfully more recently
// than this (from ANY source — the national backfill, the daily ingest cron,
// or another user's instant fetch), skip calling PlanIt again. Real-user
// actions (add area / change radius) are the one load source not paced by a
// cron schedule, so this is what keeps them polite as usage grows.
//
// Reads last_planit_success_at (0036) where it exists. The backfill stamps
// last_planit_fetch_at on failure too, so reading that alone meant a failed
// backfill suppressed a real fetch for the next two hours.
const FRESHNESS_WINDOW_MS = 2 * 60 * 60 * 1000 // 2 hours

async function lastSuccessfulFetch(admin: AdminClient, slug: string): Promise<number> {
  const withSuccess = await admin.from('councils').select('last_planit_success_at').eq('slug', slug).maybeSingle()
  if (!withSuccess.error) {
    const at = (withSuccess.data as { last_planit_success_at?: string | null } | null)?.last_planit_success_at
    return at ? new Date(at).getTime() : 0
  }
  const legacy = await admin.from('councils').select('last_planit_fetch_at').eq('slug', slug).maybeSingle()
  const at = (legacy.data as { last_planit_fetch_at?: string | null } | null)?.last_planit_fetch_at
  return at ? new Date(at).getTime() : 0
}

// Best-effort: returns null on failure rather than throwing, so callers can
// treat a PlanIt hiccup as non-fatal (the daily cron will catch it later). The
// failure is recorded against the source either way.
export async function fetchAndIngestNearby(
  admin: AdminClient,
  postcode: string,
  radiusMetres: number,
  primaryCouncilSlug: string,
): Promise<{ fetched: number; changed: number; skipped?: boolean } | null> {
  const radiusKm = Math.max(radiusMetres / 1000, MIN_RADIUS_KM)
  const sourceKey = areaSourceKey(postcode, radiusKm)
  const started = new Date()
  try {
    if (Date.now() - (await lastSuccessfulFetch(admin, primaryCouncilSlug)) < FRESHNESS_WINDOW_MS) {
      return { fetched: 0, changed: 0, skipped: true }
    }

    const result = await queryPlanIt({ kind: 'postcode', postcode, radiusKm }, { kind: 'recent', days: RECENT_DAYS })

    // A radius search can surface neighbouring authorities beyond the primary
    // one (e.g. near a border) — the resolver provisions those too.
    const resolver = await createCouncilResolver(admin)
    const toIngest = []
    for (const app of result.applications) toIngest.push(fromPlanIt(app, await resolver.resolve(app.councilName)))

    const touchedSlugs = [...new Set([primaryCouncilSlug, ...toIngest.map((a) => a.council_slug)])]
    const stampedAt = new Date().toISOString()
    await admin.from('councils').update({ last_planit_fetch_at: stampedAt }).in('slug', touchedSlugs)
    await admin.from('councils').update({ last_planit_success_at: stampedAt }).in('slug', touchedSlugs)

    await recordSourceRun(admin, {
      runId: null, job: 'territory_fetch', sourceKey, sourceLabel: postcode, councilSlug: primaryCouncilSlug,
      startedAt: started, status: 'success', httpStatus: result.httpStatus, attempts: result.attempts,
      windowDays: RECENT_DAYS, recordsReturned: result.received, sourceTotal: result.total, truncated: result.truncated,
    })

    if (toIngest.length === 0) return { fetched: 0, changed: 0 }

    const upserted = await upsertApplications(admin, toIngest, { job: 'territory_fetch' })
    return { fetched: result.received, changed: upserted.changed }
  } catch (e) {
    console.error('fetchAndIngestNearby failed (non-fatal):', e)
    await recordSourceRun(admin, {
      runId: null, job: 'territory_fetch', sourceKey, sourceLabel: postcode, councilSlug: primaryCouncilSlug,
      startedAt: started, status: 'failed', httpStatus: e instanceof PlanItError ? e.httpStatus : null,
      attempts: e instanceof PlanItError ? e.attempts : 1, windowDays: RECENT_DAYS, errorStage: 'fetch', error: e,
    })
    await logPipelineEvent(admin, { job: 'territory_fetch', stage: 'fetch', severity: 'error', sourceKey, councilSlug: primaryCouncilSlug, message: 'Add-territory fetch failed; the daily ingest will retry', error: e })
    return null
  }
}
