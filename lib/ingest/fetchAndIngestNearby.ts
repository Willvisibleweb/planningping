// Shared "fetch one postcode from PlanIt, provision any council it surfaces,
// upsert the results" step. Used by addTrackedArea (fetch on add) and the
// territory radius-update action (re-fetch after the radius changes) — same
// round-trip, same auto-provisioning, same inline scoring on upsert.
//
// This is the one load source not paced by a cron schedule: it fires whenever
// a real person adds a territory. Two things keep it polite at scale.
//
// Freshness is keyed on the SOURCE — postcode plus radius — not on the
//   council. Keyed on the council, one person adding a Birmingham postcode
//   suppressed every other Birmingham postcode for two hours, and the second
//   person's territory was stamped as fetched having never been queried.
//   Birmingham is 270km²; their part of it had nothing. Two users at the same
//   postcode and radius still share one fetch, which is the dedup that
//   actually matters.
//
// A lease stops the race. The freshness check is a read followed by a fetch,
//   with nothing in between: ten people adding the same postcode in the same
//   second all read "stale" and all called PlanIt, which starts refusing at
//   about six. Now the first one takes a short lease on that source key and
//   the rest stand down, because the fetch already under way covers exactly
//   the same query.

import { queryPlanIt, PlanItError } from '@/lib/planit'
import { fromPlanIt, upsertApplications } from '@/lib/ingest/upsertApplications'
import { createCouncilResolver } from '@/lib/ingest/councilResolver'
import { areaSourceKey } from '@/lib/reliability/sourceKeys'
import { dominantCouncil } from '@/lib/ingest/dominantCouncil'
import { logPipelineEvent, recordSourceRun } from '@/lib/reliability/pipelineLog'
import { acquirePipelineLock, releasePipelineLock } from '@/lib/reliability/pipelineLock'
import type { createAdminClient } from '@/lib/supabase/admin'

type AdminClient = ReturnType<typeof createAdminClient>

const RECENT_DAYS = 30
const MIN_RADIUS_KM = 0.5

// How recently this exact source must have succeeded for us to reuse it.
const FRESHNESS_WINDOW_MS = 2 * 60 * 60 * 1000 // 2 hours

// Long enough to cover a slow PlanIt round trip (measured average 18.6s, worst
// 63s), short enough that a crashed request does not block the next attempt
// for long. The lease expires on its own, so nothing needs cleaning up.
const FETCH_LEASE_SECONDS = 90

export interface NearbyFetchResult {
  fetched: number
  changed: number
  skipped?: boolean
  reason?: string
  /**
   * The authority PlanIt actually files this area's applications under, when
   * it differs from the one we guessed from the postcode. See
   * discoverAuthority below for why that happens.
   */
  councilSlug?: string
}

/** How far back to look purely to learn which authority covers a point. */
const DISCOVERY_DAYS = 365

/**
 * Which authority does PlanIt file this location under?
 *
 * We name a territory's council from postcodes.io, which uses current local
 * government. PlanIt uses whatever the council publishes under, which can be
 * an authority abolished years ago — CA24 3JE is in Cumberland according to
 * postcodes.io, and every application there is filed by PlanIt under Copeland,
 * one of the three districts Cumberland replaced in 2023. PlanIt has no
 * "Cumberland" at all.
 *
 * Since the dashboard selects applications by the territory's council, that
 * mismatch means a real postcode in a real council shows an empty dashboard
 * for ever, no matter how much data we hold.
 *
 * Rather than hand-maintaining a list of every council merger, ask the source:
 * whatever authority PlanIt returns for this location is the one to store
 * against. That keeps working through the next reorganisation without anyone
 * remembering to update a map.
 *
 * Only called when the ordinary window came back empty — with results in hand
 * we already know the answer and need no extra request.
 */
async function discoverAuthority(
  admin: AdminClient,
  postcode: string,
  radiusKm: number,
): Promise<string | null> {
  try {
    const probe = await queryPlanIt(
      { kind: 'postcode', postcode, radiusKm },
      { kind: 'recent', days: DISCOVERY_DAYS },
      { pageSize: 20, background: true },
    )
    if (probe.applications.length === 0) return null
    const resolver = await createCouncilResolver(admin)
    return dominantCouncil(await Promise.all(probe.applications.map((a) => resolver.resolve(a.councilName))))
  } catch {
    // Discovery is a nicety; never let it fail an add-territory.
    return null
  }
}


/** When this exact postcode+radius query last returned data. */
async function lastSuccessForSource(admin: AdminClient, sourceKey: string): Promise<number> {
  const { data } = await admin
    .from('source_runs')
    .select('started_at')
    .eq('source_key', sourceKey)
    .in('status', ['success', 'partial'])
    .order('started_at', { ascending: false })
    .limit(1)
  const at = (data?.[0] as { started_at?: string } | undefined)?.started_at
  return at ? new Date(at).getTime() : 0
}

// Best-effort: returns null on failure rather than throwing, so callers can
// treat a PlanIt hiccup as non-fatal (the daily ingest will catch it later).
// The failure is recorded against the source either way.
export async function fetchAndIngestNearby(
  admin: AdminClient,
  postcode: string,
  radiusMetres: number,
  primaryCouncilSlug: string,
): Promise<NearbyFetchResult | null> {
  const radiusKm = Math.max(radiusMetres / 1000, MIN_RADIUS_KM)
  const sourceKey = areaSourceKey(postcode, radiusKm)
  const started = new Date()

  if (Date.now() - (await lastSuccessForSource(admin, sourceKey)) < FRESHNESS_WINDOW_MS) {
    return { fetched: 0, changed: 0, skipped: true, reason: 'this area was fetched recently' }
  }

  // One fetch per source at a time. Whoever loses the race is covered by the
  // fetch already running — it is the same postcode and the same radius, so
  // there is nothing extra to ask PlanIt for.
  const lockName = `territory_fetch:${sourceKey}`
  const lockResult = await acquirePipelineLock(admin, lockName, FETCH_LEASE_SECONDS, {
    job: 'territory_fetch',
    sourceKey,
  })
  if (!lockResult.acquired) {
    return { fetched: 0, changed: 0, skipped: true, reason: 'this area is being fetched right now' }
  }
  const lock = lockResult.lock

  try {
    // Re-check under the lease. Between our freshness read and acquiring it,
    // another request may have finished the very fetch we were about to make.
    if (Date.now() - (await lastSuccessForSource(admin, sourceKey)) < FRESHNESS_WINDOW_MS) {
      return { fetched: 0, changed: 0, skipped: true, reason: 'another request just fetched this area' }
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

    if (toIngest.length === 0) {
      // Nothing recent here. Before concluding the area is quiet, check we are
      // even looking under the right authority — an empty result is exactly
      // what a council-name mismatch looks like.
      const discovered = await discoverAuthority(admin, postcode, radiusKm)
      return { fetched: 0, changed: 0, councilSlug: discovered ?? undefined }
    }

    const upserted = await upsertApplications(admin, toIngest, { job: 'territory_fetch' })
    return {
      fetched: result.received,
      changed: upserted.changed,
      councilSlug: dominantCouncil(toIngest.map((a) => a.council_slug)) ?? undefined,
    }
  } catch (e) {
    console.error('fetchAndIngestNearby failed (non-fatal):', e)
    await recordSourceRun(admin, {
      runId: null, job: 'territory_fetch', sourceKey, sourceLabel: postcode, councilSlug: primaryCouncilSlug,
      startedAt: started, status: 'failed', httpStatus: e instanceof PlanItError ? e.httpStatus : null,
      attempts: e instanceof PlanItError ? e.attempts : 1, windowDays: RECENT_DAYS, errorStage: 'fetch', error: e,
    })
    await logPipelineEvent(admin, { job: 'territory_fetch', stage: 'fetch', severity: 'error', sourceKey, councilSlug: primaryCouncilSlug, message: 'Add-territory fetch failed; the daily ingest will retry', error: e })
    return null
  } finally {
    await releasePipelineLock(admin, lock)
  }
}
