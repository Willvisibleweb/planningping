// Reading and writing the ingest queue.
//
// The decisions (how long to back off, when to give up) live in
// lib/reliability/ingestQueue.ts with no database in them, so they can be
// tested. This file is the I/O half: plan a day's work, claim a batch, and
// record what happened to each job.

import type { createAdminClient } from '@/lib/supabase/admin'
import { areaSourceKey, normalisePostcodeKey } from '@/lib/reliability/sourceKeys'
import { planRetry, summariseQueue, type JobStatus, type QueueProgress } from '@/lib/reliability/ingestQueue'
import type { AreaRow } from '@/lib/ingest/areaAlerts'
import type { SourceOutcome } from '@/lib/ingest/ingestSource'

type AdminClient = ReturnType<typeof createAdminClient>

const MIN_RADIUS_KM = 0.5

export interface IngestJobRow {
  id: string
  plan_date: string
  query_key: string
  source_key: string
  source_label: string | null
  council_slug: string | null
  postcode: string
  radius_km: number
  area_ids: string[]
  last_success_at: string | null
  status: JobStatus
  attempts: number
  run_id: string | null
}

/** The ingest day, in UTC, matching the table's default. */
export function ingestPlanDate(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10)
}

/**
 * Collapse tracked areas into one job per distinct PlanIt query, exactly as
 * the single-function ingest did: same postcode and radius means one query,
 * and every area sharing it is carried along for the alert fan-out.
 */
export function planJobsFromAreas(areas: AreaRow[]): Array<Omit<IngestJobRow, 'id' | 'plan_date' | 'status' | 'attempts' | 'run_id'>> {
  const byKey = new Map<string, AreaRow[]>()
  for (const a of areas) {
    const km = Math.max((a.radius_metres ?? 800) / 1000, MIN_RADIUS_KM)
    const key = `${normalisePostcodeKey(a.postcode)}|${km}`
    byKey.set(key, [...(byKey.get(key) ?? []), a])
  }

  const jobs = []
  for (const [key, list] of byKey) {
    // The oldest success among the areas sharing this query decides how far
    // back to recover. A never-fetched area counts as no success at all.
    const stamps = list.map((a) => a.last_planit_fetch_at)
    const lastSuccessAt = stamps.some((t) => t === null)
      ? null
      : stamps.reduce<string | null>((min, t) => (min === null || (t as string) < min ? t : min), null)
    const radiusKm = Number(key.split('|')[1])
    jobs.push({
      query_key: key,
      source_key: areaSourceKey(list[0].postcode, radiusKm),
      source_label: list[0].label ?? null,
      council_slug: list[0].council_slug ?? null,
      postcode: list[0].postcode,
      radius_km: radiusKm,
      area_ids: list.map((a) => a.id),
      last_success_at: lastSuccessAt,
    })
  }
  // Oldest-fetched first, so a territory that missed yesterday goes first today.
  jobs.sort((a, b) => (a.last_success_at ?? '').localeCompare(b.last_success_at ?? ''))
  return jobs
}

export interface PlanResult {
  planDate: string
  planned: number
  alreadyQueued: number
}

/**
 * Write one job per source for the day. Idempotent: the unique key is
 * (plan_date, query_key), so running the planner twice re-plans nothing and
 * cannot reset a job that is already running or done.
 */
export async function planDayQueue(
  db: AdminClient,
  opts: { planDate: string; runId: string | null; areas: AreaRow[] },
): Promise<PlanResult> {
  const jobs = planJobsFromAreas(opts.areas)
  if (jobs.length === 0) return { planDate: opts.planDate, planned: 0, alreadyQueued: 0 }

  const { data: existing } = await db
    .from('ingest_jobs')
    .select('query_key')
    .eq('plan_date', opts.planDate)
  const existingKeys = new Set((existing ?? []).map((r: { query_key: string }) => r.query_key))

  const rows = jobs
    .filter((j) => !existingKeys.has(j.query_key))
    .map((j) => ({ ...j, plan_date: opts.planDate, run_id: opts.runId }))

  if (rows.length > 0) {
    const { error } = await db.from('ingest_jobs').insert(rows)
    if (error) throw new Error(`could not plan ingest queue: ${error.message}`)
  }

  return { planDate: opts.planDate, planned: rows.length, alreadyQueued: existingKeys.size }
}

/**
 * The pipeline run today's queue was planned under, if the day is already
 * planned.
 *
 * The planner is called on every scheduled tick now, not once a morning, and
 * planDayQueue is idempotent — so without this each tick opened a fresh
 * pipeline_run that no job ever pointed at and finalise therefore never
 * closed. They accumulated as permanently 'running' and the health endpoint
 * counted them as stuck.
 */
export async function runIdForDay(db: AdminClient, planDate: string): Promise<string | null> {
  const { data } = await db
    .from('ingest_jobs')
    .select('run_id')
    .eq('plan_date', planDate)
    .not('run_id', 'is', null)
    .limit(1)
  return (data?.[0]?.run_id as string | undefined) ?? null
}

export async function claimJobs(
  db: AdminClient,
  opts: { planDate: string; limit: number; worker: string; leaseSeconds: number },
): Promise<IngestJobRow[]> {
  const { data, error } = await db.rpc('claim_ingest_jobs', {
    p_plan_date: opts.planDate,
    p_limit: opts.limit,
    p_worker: opts.worker,
    p_lease_seconds: opts.leaseSeconds,
  })
  if (error) throw new Error(`could not claim ingest jobs: ${error.message}`)
  return (data ?? []) as IngestJobRow[]
}

/** The tracked_area rows a job covers, re-read at work time so a territory
 *  deleted or deactivated since planning is not emailed about. */
export async function loadJobAreas(db: AdminClient, areaIds: string[]): Promise<AreaRow[]> {
  if (areaIds.length === 0) return []
  const { data } = await db
    .from('tracked_areas')
    .select('id, user_id, postcode, radius_metres, alerts_enabled, min_band, label, council_slug, last_planit_fetch_at')
    .eq('is_active', true)
    .in('id', areaIds)
  return (data ?? []) as AreaRow[]
}

export async function completeJob(db: AdminClient, jobId: string, outcome: SourceOutcome): Promise<void> {
  await db
    .from('ingest_jobs')
    .update({
      status: 'done',
      finished_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      lease_until: null,
      last_error: outcome.error,
      last_http_status: outcome.httpStatus,
      result: {
        status: outcome.status,
        fetched: outcome.fetched,
        new: outcome.newRefs,
        changed: outcome.changed,
        unchanged: outcome.unchanged,
        alerts_sent: outcome.alertsSent,
        window: outcome.window,
      },
    })
    .eq('id', jobId)
}

/**
 * Close a job that no longer has anything to fetch for — every territory it
 * was planned for has since been deleted or deactivated. Marked done rather
 * than failed: nothing went wrong, the work simply evaporated.
 */
export async function skipJob(db: AdminClient, jobId: string, reason: string): Promise<void> {
  await db
    .from('ingest_jobs')
    .update({
      status: 'done',
      finished_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      lease_until: null,
      result: { status: 'skipped', reason },
    })
    .eq('id', jobId)
}

export interface FailureRecord {
  status: 'pending' | 'failed'
  waitMinutes: number | null
  reason: string
}

/** Apply the backoff policy to a job that just failed. */
export async function failJob(
  db: AdminClient,
  job: IngestJobRow,
  outcome: SourceOutcome,
): Promise<FailureRecord> {
  const decision = planRetry(job.attempts, {
    sourceKey: job.source_key,
    rateLimited: outcome.rateLimited,
  })

  await db
    .from('ingest_jobs')
    .update({
      status: decision.status,
      next_attempt_at: decision.nextAttemptAt ?? new Date().toISOString(),
      finished_at: decision.status === 'failed' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
      lease_until: null,
      last_error: outcome.error,
      last_http_status: outcome.httpStatus,
    })
    .eq('id', job.id)

  return { status: decision.status, waitMinutes: decision.waitMinutes, reason: decision.reason }
}

export async function loadQueueProgress(db: AdminClient, planDate: string): Promise<QueueProgress> {
  const { data } = await db.from('ingest_jobs').select('status').eq('plan_date', planDate)
  return summariseQueue((data ?? []) as Array<{ status: JobStatus }>)
}
