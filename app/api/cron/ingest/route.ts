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
import { queryPlanIt, PlanItError, type PlanItQueryResult } from '@/lib/planit'
import { fromPlanIt, upsertApplications, type IngestApplication } from '@/lib/ingest/upsertApplications'
import { createCouncilResolver } from '@/lib/ingest/councilResolver'
import { planChangeWindow, planSubmissionWindow } from '@/lib/reliability/fetchWindows'
import { areaSourceKey, normalisePostcodeKey } from '@/lib/reliability/sourceKeys'
import {
  finishPipelineRun,
  logPipelineEvent,
  recordSourceRun,
  startPipelineRun,
  updateSourceRunCounts,
} from '@/lib/reliability/pipelineLog'
import { resolveDischargeParents } from '@/lib/ingest/resolveDischargeParents'
import { flagStaleDischarges } from '@/lib/ingest/flagStaleDischarges'
import { sendDischargeAlerts } from '@/lib/alerts/dischargeAlerts'
import { sendDecisionAlerts } from '@/lib/alerts/decisionAlerts'
import { enforcePlanLimitsForAll } from '@/lib/plan/enforceLimits'
import { ingestTenders } from '@/lib/tenders/ingestTenders'
import { hasProAccess } from '@/lib/access'
import { getUserFeatures } from '@/lib/features'
import { sendAlertEmail, type AlertItem } from '@/lib/email'
import { runWeeklyDigest } from '@/lib/email/runWeeklyDigest'
import { acquirePipelineLock, lockedPipelineResponse, PLANIT_PIPELINE_LOCK, releasePipelineLock } from '@/lib/reliability/pipelineLock'
import { runHealthAlertCheck } from '@/lib/reliability/healthAlerts'
import type { Profile, MinBand } from '@/types/database'

export const maxDuration = 300

const MIN_RADIUS_KM = 0.5
const DELAY_MS = 3000 // be polite to PlanIt's rate limiter between area queries
const CHANGE_PASS_DELAY_MS = 2500
const RATE_LIMIT_COOLDOWN_MS = 15_000
const MAX_RATE_LIMITS_PER_RUN = 2
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://planningping.com'

interface AreaRow {
  id: string
  user_id: string
  postcode: string
  radius_metres: number | null
  alerts_enabled: boolean
  min_band: MinBand
  label: string
  council_slug: string
  last_planit_fetch_at: string | null
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
  const lockResult = await acquirePipelineLock(supabase, PLANIT_PIPELINE_LOCK, 600, { job: 'ingest', trigger: 'cron' })
  if (!lockResult.acquired) return lockedPipelineResponse('ingest', lockResult)
  const lock = lockResult.lock

  try {
  const runId = await startPipelineRun(supabase, 'ingest', 'cron')

  // Bring everyone's areas back within their plan before spending anything on
  // them. Plan limits were previously checked only when an area was created,
  // so a trial ending or a downgrade left the extra areas in place and this
  // cron carried on fetching them from PlanIt daily at our cost. Enforcing
  // after the fetch would mean paying for the data first and then deciding the
  // user was not entitled to it.
  const reconciled = await enforcePlanLimitsForAll(supabase)
  if (reconciled.length > 0) {
    console.log('plan limits reconciled:', JSON.stringify(reconciled))
  }

  // Tenders first: one HTTP call and one upsert, a couple of seconds. Running it
  // before the planning loop means it still happens on a day when that loop
  // exhausts its time budget and stops early — the reverse order would make
  // tenders the first thing silently dropped on a slow day.
  // Wrapped so a tender-feed failure is recorded but cannot take the planning
  // ingest down with it.
  let tenderResult: Awaited<ReturnType<typeof ingestTenders>> | { error: string }
  try {
    tenderResult = await ingestTenders(supabase)
  } catch (e) {
    await logPipelineEvent(supabase, { runId, job: 'ingest', stage: 'tenders', severity: 'error', message: 'Tender ingest failed', error: e })
    tenderResult = { error: 'tender ingest failed — see pipeline_events' }
  }

  // Oldest-fetched first. A run can now stop early on its time budget, so a
  // fixed order would leave the areas at the back permanently stale while the
  // front updated daily. Nulls first means a brand-new area is fetched next.
  const { data: areas, error } = await supabase
    .from('tracked_areas')
    .select('id, user_id, postcode, radius_metres, alerts_enabled, min_band, label, council_slug, last_planit_fetch_at')
    .eq('is_active', true)
    .order('last_planit_fetch_at', { ascending: true, nullsFirst: true })
  if (error) {
    await logPipelineEvent(supabase, { runId, job: 'ingest', stage: 'load_areas', severity: 'critical', message: 'Could not load tracked areas', error: error.message })
    await finishPipelineRun(supabase, runId, 'failed', { stage: 'load_areas' })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const areaRows = (areas ?? []) as AreaRow[]

  // One resolver for every ingest path — see lib/ingest/councilResolver.ts for
  // the Bristol duplicate this prevents.
  const resolver = await createCouncilResolver(supabase)

  // Collapse duplicate postcode+radius queries, but keep every tracked_area
  // that shares a query key — that's the alert fan-out's attribution seam:
  // PlanIt's own radius search already tells us who's covered, no need to
  // reimplement distance matching. The postcode is normalised first, so
  // 'ST104AJ' and 'ST10 4AJ' are one query rather than two identical ones.
  const queries: { postcode: string; km: number; key: string; lastSuccess: string | null }[] = []
  const queryKeyToAreas = new Map<string, AreaRow[]>()
  for (const a of areaRows) {
    const km = Math.max((a.radius_metres ?? 800) / 1000, MIN_RADIUS_KM)
    const key = `${normalisePostcodeKey(a.postcode)}|${km}`
    const list = queryKeyToAreas.get(key) ?? []
    list.push(a)
    queryKeyToAreas.set(key, list)
  }
  for (const [key, list] of queryKeyToAreas) {
    // The oldest success among the areas sharing this query decides how far
    // back to recover. A never-fetched area counts as no success at all.
    const stamps = list.map((a) => a.last_planit_fetch_at)
    const lastSuccess = stamps.some((t) => t === null)
      ? null
      : stamps.reduce<string | null>((min, t) => (min === null || (t as string) < min ? t : min), null)
    queries.push({ postcode: list[0].postcode, km: Number(key.split('|')[1]), key, lastSuccess })
  }
  // Oldest-fetched first, as before.
  queries.sort((a, b) => (a.lastSuccess ?? '').localeCompare(b.lastSuccess ?? ''))

  const perArea: Array<{ postcode: string; fetched: number; changed_since_last_sync?: number; window?: string; error?: string }> = []
  let failures = 0
  let applicationsFetched = 0
  let changedTotal = 0
  let unchangedTotal = 0
  let enrichedTotal = 0
  let newTotal = 0
  let newAnnouncedTotal = 0
  let changesRecordedTotal = 0
  let duplicateCandidatesTotal = 0
  let collapsedInBatchTotal = 0
  let referenceVariantsResolvedTotal = 0
  let warningsTotal = 0
  let alertsSent = 0
  let dischargeParentsResolved = 0
  let dischargeNewlyStale = 0
  let dischargeAlertsSent = 0
  let decisionsDetected = 0
  let decisionAlertsSent = 0
  let planitRateLimits = 0

  // Stop starting new queries with time to spare, and return what we have.
  //
  // This run used to fetch all areas and only then upsert, so once PlanIt
  // slowed down and the function hit its 300s ceiling mid-loop, Vercel killed
  // it before a single row was written. Data silently stopped updating on 31
  // July because of it. Ending early on our own terms means partial progress
  // is always saved, and the areas that missed out are first in line next run.
  const QUERY_DEADLINE_MS = 200_000
  const startedAt = Date.now()
  let stoppedEarly = false

  for (const q of queries) {
    if (Date.now() - startedAt > QUERY_DEADLINE_MS) {
      stoppedEarly = true
      break
    }
    const now = new Date()
    const areasForKey = queryKeyToAreas.get(q.key) ?? []
    const sourceKey = areaSourceKey(q.postcode, q.km)
    const where = { kind: 'postcode' as const, postcode: q.postcode, radiusKm: q.km }
    // Submission window: rolling 30 days, or back to the last success after an
    // outage. Change window: everything whose content changed since the last
    // success, however old — this is what picks up decisions.
    const window = planSubmissionWindow(q.lastSuccess, now)
    const changeWindow = planChangeWindow(q.lastSuccess, now)
    const queryStarted = new Date()

    let submitted: PlanItQueryResult
    try {
      submitted = await queryPlanIt(where, { kind: 'submitted', startDate: window.startDate, endDate: window.endDate }, { background: true })
    } catch (e) {
      failures++
      const rateLimited = e instanceof PlanItError && e.httpStatus === 429
      if (rateLimited) planitRateLimits++
      await recordSourceRun(supabase, {
        runId, job: 'ingest', sourceKey, sourceLabel: areasForKey[0]?.label ?? q.postcode,
        councilSlug: areasForKey[0]?.council_slug ?? null, startedAt: queryStarted, status: 'failed',
        httpStatus: e instanceof PlanItError ? e.httpStatus : null, attempts: e instanceof PlanItError ? e.attempts : 1,
        windowStart: window.startDate, windowEnd: window.endDate, windowDays: window.days,
        errorStage: 'fetch_submitted', error: e,
      })
      await logPipelineEvent(supabase, {
        runId, job: 'ingest', stage: 'fetch', severity: 'error', sourceKey,
        councilSlug: areasForKey[0]?.council_slug ?? null, message: 'PlanIt fetch failed', error: e,
        retryCount: e instanceof PlanItError ? Math.max(e.attempts - 1, 0) : 0, recovered: false,
      })
      perArea.push({ postcode: q.postcode, fetched: 0, error: String(e) })
      if (rateLimited) {
        await new Promise((r) => setTimeout(r, RATE_LIMIT_COOLDOWN_MS))
        if (planitRateLimits >= MAX_RATE_LIMITS_PER_RUN) {
          stoppedEarly = true
          await logPipelineEvent(supabase, {
            runId,
            job: 'ingest',
            stage: 'rate_limit',
            severity: 'warning',
            sourceKey,
            message: `Stopping ingest early after ${planitRateLimits} PlanIt rate-limit responses`,
            recovered: false,
          })
          break
        }
      } else {
        await new Promise((r) => setTimeout(r, DELAY_MS))
      }
      continue
    }

    let changed: PlanItQueryResult | null = null
    let changeError: unknown = null
    await new Promise((r) => setTimeout(r, CHANGE_PASS_DELAY_MS))
    try {
      changed = await queryPlanIt(where, { kind: 'changed', differentStart: changeWindow.differentStart }, { background: true })
    } catch (e) {
      changeError = e
      if (e instanceof PlanItError && e.httpStatus === 429) planitRateLimits++
    }

    const sourceApps: IngestApplication[] = []
    const sourceQueryKeyToApps = new Map<string, { council_slug: string; reference: string }[]>()
    const sourceFromSubmissionWindow = new Set<string>()
    const keys = new Set<string>()
    const appList: { council_slug: string; reference: string }[] = []
    for (const app of [...submitted.applications, ...(changed?.applications ?? [])]) {
      const council_slug = await resolver.resolve(app.councilName)
      const key = `${council_slug}|${app.reference}`
      if (keys.has(key)) continue
      keys.add(key)
      sourceApps.push(fromPlanIt(app, council_slug))
      appList.push({ council_slug, reference: app.reference })
    }
    for (const app of submitted.applications) {
      sourceFromSubmissionWindow.add(`${resolver.canonical(await resolver.resolve(app.councilName))}|${app.reference}`)
    }
    sourceQueryKeyToApps.set(q.key, appList)
    perArea.push({
      postcode: q.postcode,
      fetched: submitted.received,
      changed_since_last_sync: changed?.received,
      window: window.mode === 'recovery' ? window.reason : undefined,
      error: changeError ? `change pass failed: ${String(changeError)}` : undefined,
    })

    const sourceRunId = await recordSourceRun(supabase, {
      runId, job: 'ingest', sourceKey, sourceLabel: areasForKey[0]?.label ?? q.postcode,
      councilSlug: areasForKey[0]?.council_slug ?? null, startedAt: queryStarted,
      status: changeError ? 'partial' : 'success',
      httpStatus: submitted.httpStatus, attempts: submitted.attempts + (changed?.attempts ?? 0),
      windowStart: window.startDate, windowEnd: window.endDate, windowDays: window.days,
      recordsReturned: submitted.received, sourceTotal: submitted.total,
      truncated: submitted.truncated || Boolean(changed?.truncated),
      changedRecords: changed?.received ?? null,
      errorStage: changeError ? 'fetch_changes' : null, error: changeError ?? undefined,
      recovered: window.mode === 'recovery',
    })

    if (changeError) {
      await logPipelineEvent(supabase, {
        runId, job: 'ingest', stage: 'fetch_changes', severity: 'warning', sourceKey,
        message: 'Status-change pass failed; submission window still ingested', error: changeError,
      })
    }
    if (submitted.truncated || changed?.truncated) {
      await logPipelineEvent(supabase, {
        runId, job: 'ingest', stage: 'fetch', severity: 'warning', sourceKey,
        message: `PlanIt reported more records than were retrieved (submitted ${submitted.received}/${submitted.total ?? '?'}, changed ${changed?.received ?? 0}/${changed?.total ?? '?'})`,
      })
    }
    if (window.mode === 'recovery') {
      await logPipelineEvent(supabase, {
        runId, job: 'ingest', stage: 'recovery', severity: window.capped ? 'warning' : 'info', sourceKey,
        message: window.reason, recovered: true,
      })
    }

    let result: Awaited<ReturnType<typeof upsertApplications>>
    try {
      result = await upsertApplications(supabase, sourceApps, { runId, job: 'ingest' })
    } catch (e) {
      failures++
      await logPipelineEvent(supabase, {
        runId,
        job: 'ingest',
        stage: 'upsert',
        severity: 'critical',
        sourceKey,
        councilSlug: areasForKey[0]?.council_slug ?? null,
        message: 'Source upsert failed; this source will be retried next run',
        error: e,
      })
      await new Promise((r) => setTimeout(r, DELAY_MS))
      continue
    }

    // Per-source outcome counts are written immediately. A later timeout must
    // not leave already-processed sources looking unfinished.
    const newKeys = new Set(result.new_applications.map((a) => `${a.council_slug}|${a.reference}`))
    const writtenKeys = new Set(result.written_keys)
    let fresh = 0
    let updated = 0
    for (const key of keys) {
      if (newKeys.has(key)) fresh++
      else if (writtenKeys.has(key)) updated++
    }
    await updateSourceRunCounts(supabase, sourceRunId, {
      new_count: fresh,
      updated_count: updated,
      unchanged_count: keys.size - fresh - updated,
    })

    const announceable = result.new_applications.filter((a) => sourceFromSubmissionWindow.has(`${a.council_slug}|${a.reference}`))
    alertsSent += await sendBatchedAlerts(supabase, {
      queryKeyToAreas: new Map([[q.key, areasForKey]]),
      queryKeyToApps: sourceQueryKeyToApps,
      newApplications: announceable,
    })

    if (announceable.some((a) => a.application_type === 'discharge_of_condition')) {
      dischargeParentsResolved += await resolveDischargeParents(supabase)
      dischargeAlertsSent += await sendDischargeAlerts(supabase, {
        newApplications: announceable,
        staleRows: [],
        siteUrl: SITE_URL,
      })
    }

    decisionsDetected += result.decided_applications.length
    decisionAlertsSent += await sendDecisionAlerts(supabase, {
      decided: result.decided_applications,
      siteUrl: SITE_URL,
    })

    applicationsFetched += sourceApps.length
    changedTotal += result.changed
    unchangedTotal += result.unchanged
    enrichedTotal += result.enriched
    newTotal += result.new_refs.length
    newAnnouncedTotal += announceable.length
    changesRecordedTotal += result.changes_recorded
    duplicateCandidatesTotal += result.duplicate_candidates
    collapsedInBatchTotal += result.collapsed_in_batch
    referenceVariantsResolvedTotal += result.reference_variants_resolved
    warningsTotal += result.warnings

    // Stamp only the exact tracked-area rows covered by this postcode+radius
    // query, after the source has actually been upserted. The stamp means
    // "last successful sync", not merely "last successful fetch".
    const areaIds = areasForKey.map((a) => a.id)
    if (areaIds.length > 0) {
      await supabase
        .from('tracked_areas')
        .update({ last_planit_fetch_at: new Date().toISOString() })
        .eq('is_active', true)
        .in('id', areaIds)
    }
    await new Promise((r) => setTimeout(r, DELAY_MS))
  }

  // Discharge-of-condition: a separate, independent fan-out (tracked_leads,
  // not tracked_areas — see lib/alerts/dischargeAlerts.ts). Parent-ID
  // resolution runs every tick (a discharge row's parent is often ingested
  // on a later run), then stale-flagging, then the alert itself reads both.
  const resolvedParents = await resolveDischargeParents(supabase)
  dischargeParentsResolved += resolvedParents
  const newlyStaleDischarges = await flagStaleDischarges(supabase)
  dischargeNewlyStale += newlyStaleDischarges.length
  dischargeAlertsSent += await sendDischargeAlerts(supabase, {
    newApplications: [],
    staleRows: newlyStaleDischarges,
    siteUrl: SITE_URL,
  })

  // The daily ingest cron is known to run. Let it own the Monday digest too,
  // rather than depending on a separate weekly schedule that previously
  // stopped after manual test sends. The digest has its own exact-window guard,
  // so retrying the ingest cannot resend a completed week.
  const digest =
    new Date().getUTCDay() === 1
      ? await runWeeklyDigest(supabase, { siteUrl: SITE_URL })
      : null

  const summary = {
    areas_queried: perArea.length,
    areas_failed: failures,
    areas_pending: queries.length - perArea.length,
    stopped_early: stoppedEarly,
    applications_fetched: applicationsFetched,
    changed: changedTotal,
    unchanged: unchangedTotal,
    new: newTotal,
    changes_recorded: changesRecordedTotal,
    duplicate_candidates: duplicateCandidatesTotal,
    collapsed_in_batch: collapsedInBatchTotal,
    reference_variants_resolved: referenceVariantsResolvedTotal,
    warnings: warningsTotal,
    planit_rate_limits: planitRateLimits,
  }
  await finishPipelineRun(supabase, runId, failures > 0 || stoppedEarly || warningsTotal > 0 ? 'partial' : 'success', summary)

  // One more reliability check before the cron exits. We deliberately piggyback
  // on the existing daily ingest schedule instead of adding a third Vercel cron
  // entry: some Vercel plans cap projects at two cron jobs, and this project
  // already uses both. The protected /api/cron/health-check route exists for
  // manual checks or an external scheduler if we later want belt and braces.
  const healthAlert = await runHealthAlertCheck({ db: supabase })

  return NextResponse.json({
    ran_at: new Date().toISOString(),
    run_id: runId,
    source: 'planit',
    // Reported so a run that fetched no tenders is visibly a quiet day rather
    // than an integration that quietly stopped working.
    tenders: tenderResult,
    ...summary,
    enriched: enrichedTotal,
    new_announced: newAnnouncedTotal,
    alerts_sent: alertsSent,
    discharge_parents_resolved: dischargeParentsResolved,
    discharge_newly_stale: dischargeNewlyStale,
    discharge_alerts_sent: dischargeAlertsSent,
    decisions_detected: decisionsDetected,
    decision_alerts_sent: decisionAlertsSent,
    digest,
    health_alert: healthAlert,
    per_area: perArea,
  })
  } finally {
    await releasePipelineLock(supabase, lock)
  }
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
    // Partner suggestions are opt-in and per-account. Resolved here from the
    // profile rather than inside the email builder, so there is exactly one
    // place that decides whether someone is in a partner network — the same
    // getUserFeatures the UI uses.
    const features = getUserFeatures(profile)
    const sent = await sendAlertEmail({
      to: profile!.email,
      items,
      siteUrl: SITE_URL,
      partner: features.siteMonitoring ? features.partnershipProvider : null,
    })
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
