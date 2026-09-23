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
import { fetchAuthorityList, queryPlanIt, PlanItError, slugifyAuthority } from '@/lib/planit'
import { fromPlanIt, upsertApplications } from '@/lib/ingest/upsertApplications'
import { createCouncilResolver } from '@/lib/ingest/councilResolver'
import { authoritySourceKey } from '@/lib/reliability/sourceKeys'
import { finishPipelineRun, logPipelineEvent, recordSourceRun, startPipelineRun } from '@/lib/reliability/pipelineLog'
import { acquirePipelineLock, PLANIT_PIPELINE_LOCK, releasePipelineLock } from '@/lib/reliability/pipelineLock'
import { isAuthorisedCron, respondInBackground } from '@/lib/api/backgroundCron'

export const maxDuration = 300

const RECENT_DAYS = 30
// Sized against maxDuration=300s with the background-batch retry budget in
// lib/planit.ts (2 attempts, 4s backoff cap): worst case per council is
// ~DELAY_MS + one retry, so 15 * (2s + ~11s worst case) = ~195s, comfortably
// inside the limit even if several councils hit a 429 in the same run.
const BATCH_SIZE = 15
const DELAY_MS = 2000 // more conservative than the ingest cron's 1.5s — this is bonus background growth, not core product freshness

export async function GET(request: NextRequest) {
  if (!isAuthorisedCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return respondInBackground(request, { job: 'backfill-councils' }, backfillBatch)
}

async function backfillBatch(): Promise<Record<string, unknown>> {
  const supabase = createAdminClient()
  const lockResult = await acquirePipelineLock(supabase, PLANIT_PIPELINE_LOCK, 600, { job: 'backfill_councils', trigger: 'cron' })
  if (!lockResult.acquired) {
    return {
      skipped: true,
      job: 'backfill_councils',
      reason: lockResult.error ? 'pipeline_lock_unavailable' : 'pipeline_lock_held',
      locked_until: lockResult.lockedUntil,
    }
  }
  const lock = lockResult.lock

  try {
  const runId = await startPipelineRun(supabase, 'backfill_councils', 'cron')
  const resolver = await createCouncilResolver(supabase)

  // Self-healing: make sure every PlanIt authority has a councils row, so the
  // batch selection below has something to iterate over even for authorities
  // no user has ever searched near. Cheap — one PlanIt request regardless of
  // batch size, and also picks up any new authority PlanIt adds over time.
  //
  // Only names we do not already know are inserted. Upserting every name by
  // its slugified form is what created the empty 'bristol' twin of
  // 'bristol-city-of'. And a failure here no longer ends the run: the list
  // only discovers new authorities, and the existing rotation does not need it.
  let allAuthorities: string[] = []
  try {
    allAuthorities = await fetchAuthorityList()
    const unknown = allAuthorities.filter((name) => !resolver.knows(name))
    if (unknown.length > 0) {
      await supabase.from('councils').upsert(
        unknown.map((name) => ({ slug: slugifyAuthority(name), name, supported: true })),
        { onConflict: 'slug', ignoreDuplicates: true },
      )
    }
  } catch (e) {
    await logPipelineEvent(supabase, { runId, job: 'backfill_councils', stage: 'authority_list', severity: 'warning', message: 'PlanIt authority list unavailable; continuing with known councils', error: e })
  }

  const { data: batch, error } = await supabase
    .from('councils')
    .select('slug, name')
    .eq('supported', true)
    .order('last_planit_fetch_at', { ascending: true, nullsFirst: true })
    .limit(BATCH_SIZE)

  if (error) {
    await logPipelineEvent(supabase, { runId, job: 'backfill_councils', stage: 'load_councils', severity: 'critical', message: 'Could not load councils', error: error.message })
    await finishPipelineRun(supabase, runId, 'failed', { stage: 'load_councils' })
    throw new Error(`could not load councils: ${error.message}`)
  }
  if (!batch || batch.length === 0) {
    await finishPipelineRun(supabase, runId, 'success', { message: 'No councils to backfill' })
    return { message: 'No councils to backfill', total_authorities: allAuthorities.length }
  }

  const results: Array<{ council: string; fetched: number; changed: number; error?: string }> = []
  let failures = 0

  for (const council of batch) {
    const started = new Date()
    const sourceKey = authoritySourceKey(council.slug)
    try {
      const fetched = await queryPlanIt(
        { kind: 'authority', authorityName: council.name },
        { kind: 'recent', days: RECENT_DAYS },
        { background: true },
      )
      const toIngest = []
      for (const app of fetched.applications) toIngest.push(fromPlanIt(app, await resolver.resolve(app.councilName)))
      const { changed } = await upsertApplications(supabase, toIngest, { runId, job: 'backfill_councils' })
      results.push({ council: council.name, fetched: fetched.received, changed })
      await recordSourceRun(supabase, {
        runId, job: 'backfill_councils', sourceKey, sourceLabel: council.name, councilSlug: council.slug,
        startedAt: started, status: 'success', httpStatus: fetched.httpStatus, attempts: fetched.attempts,
        windowDays: RECENT_DAYS, recordsReturned: fetched.received, sourceTotal: fetched.total, truncated: fetched.truncated,
      })
      // Success is stamped separately from the attempt: the add-territory path
      // treats this as "fresh data exists" and must not be fooled by a failure.
      const { error: successError } = await supabase
        .from('councils')
        .update({ last_planit_success_at: new Date().toISOString() })
        .eq('slug', council.slug)
      if (successError && !/last_planit_success_at/.test(successError.message)) {
        await logPipelineEvent(supabase, { runId, job: 'backfill_councils', stage: 'stamp', severity: 'warning', councilSlug: council.slug, message: 'Could not stamp success time', error: successError.message })
      }
    } catch (e) {
      failures++
      results.push({ council: council.name, fetched: 0, changed: 0, error: String(e) })
      await recordSourceRun(supabase, {
        runId, job: 'backfill_councils', sourceKey, sourceLabel: council.name, councilSlug: council.slug,
        startedAt: started, status: 'failed', httpStatus: e instanceof PlanItError ? e.httpStatus : null,
        attempts: e instanceof PlanItError ? e.attempts : 1, windowDays: RECENT_DAYS, errorStage: 'fetch', error: e,
      })
      await logPipelineEvent(supabase, { runId, job: 'backfill_councils', stage: 'fetch', severity: 'error', sourceKey, councilSlug: council.slug, message: `Backfill failed for ${council.name}`, error: e })
    }
    // Stamp last_planit_fetch_at regardless of success/failure — a persistently
    // erroring council (e.g. PlanIt has no data for it) must not stay at the
    // front of the queue forever and block the rest of the rotation.
    await supabase.from('councils').update({ last_planit_fetch_at: new Date().toISOString() }).eq('slug', council.slug)
    await new Promise((r) => setTimeout(r, DELAY_MS))
  }

  await finishPipelineRun(supabase, runId, failures > 0 ? 'partial' : 'success', { batch_size: batch.length, failures })

  return {
    ran_at: new Date().toISOString(),
    run_id: runId,
    total_authorities: allAuthorities.length,
    batch_size: batch.length,
    failures,
    results,
  }
  } finally {
    await releasePipelineLock(supabase, lock)
  }
}
