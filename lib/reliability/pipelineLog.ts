// Run and error logging for the ingestion pipeline.
//
// Every function here swallows its own failures. Logging exists to make the
// pipeline observable; a logging table that is missing (migration not yet
// applied) or briefly unreachable must never be the reason an ingest stops.
// Each event is also written to the function log as one JSON line, so it is
// visible in Vercel even when the database write is the thing that failed.

import type { createAdminClient } from '@/lib/supabase/admin'
import { sanitiseError, sanitiseMessage } from '@/lib/reliability/sanitise'

type AdminClient = ReturnType<typeof createAdminClient>

export type PipelineJob = 'ingest' | 'backfill_councils' | 'backfill_history' | 'territory_fetch' | 'webhook' | 'health_check'
export type PipelineTrigger = 'cron' | 'manual' | 'user_action' | 'webhook'
export type RunOutcome = 'success' | 'partial' | 'failed'
export type EventSeverity = 'info' | 'warning' | 'error' | 'critical'

export async function startPipelineRun(
  db: AdminClient,
  job: PipelineJob,
  trigger: PipelineTrigger = 'cron',
): Promise<string | null> {
  try {
    const { data, error } = await db.from('pipeline_runs').insert({ job, trigger }).select('id').single()
    if (error) throw error
    return (data?.id as string) ?? null
  } catch (e) {
    console.error(JSON.stringify({ at: 'pipelineLog.startPipelineRun', job, error: sanitiseError(e) }))
    return null
  }
}

export async function finishPipelineRun(
  db: AdminClient,
  runId: string | null,
  status: RunOutcome,
  summary: Record<string, unknown>,
): Promise<void> {
  if (!runId) return
  try {
    const { error } = await db
      .from('pipeline_runs')
      .update({ status, finished_at: new Date().toISOString(), summary })
      .eq('id', runId)
    if (error) throw error
  } catch (e) {
    console.error(JSON.stringify({ at: 'pipelineLog.finishPipelineRun', runId, error: sanitiseError(e) }))
  }
}

export interface SourceRunRecord {
  runId: string | null
  job: PipelineJob
  sourceKey: string
  sourceLabel?: string | null
  councilSlug?: string | null
  startedAt: Date
  status: 'success' | 'partial' | 'failed' | 'skipped'
  httpStatus?: number | null
  attempts?: number
  windowStart?: string | null
  windowEnd?: string | null
  windowDays?: number | null
  recordsReturned?: number | null
  sourceTotal?: number | null
  truncated?: boolean
  changedRecords?: number | null
  errorStage?: string | null
  error?: unknown
  recovered?: boolean | null
}

export async function recordSourceRun(db: AdminClient, run: SourceRunRecord): Promise<string | null> {
  const finished = new Date()
  const row = {
    run_id: run.runId,
    job: run.job,
    source_type: 'planit',
    source_key: run.sourceKey,
    source_label: run.sourceLabel ?? null,
    council_slug: run.councilSlug ?? null,
    started_at: run.startedAt.toISOString(),
    finished_at: finished.toISOString(),
    duration_ms: finished.getTime() - run.startedAt.getTime(),
    status: run.status,
    http_status: run.httpStatus ?? null,
    attempts: run.attempts ?? 1,
    window_start: run.windowStart ?? null,
    window_end: run.windowEnd ?? null,
    window_days: run.windowDays ?? null,
    records_returned: run.recordsReturned ?? null,
    source_total: run.sourceTotal ?? null,
    truncated: run.truncated ?? false,
    changed_records: run.changedRecords ?? null,
    error_stage: run.errorStage ?? null,
    error_message: run.error === undefined || run.error === null ? null : sanitiseError(run.error),
    recovered: run.recovered ?? null,
  }
  try {
    const { data, error } = await db.from('source_runs').insert(row).select('id').single()
    if (error) throw error
    return (data?.id as string) ?? null
  } catch (e) {
    console.error(JSON.stringify({ at: 'pipelineLog.recordSourceRun', source_key: run.sourceKey, status: run.status, error: sanitiseError(e) }))
    return null
  }
}

export async function updateSourceRunCounts(
  db: AdminClient,
  sourceRunId: string | null,
  counts: { new_count: number; updated_count: number; unchanged_count: number },
): Promise<void> {
  if (!sourceRunId) return
  try {
    const { error } = await db.from('source_runs').update(counts).eq('id', sourceRunId)
    if (error) throw error
  } catch (e) {
    console.error(JSON.stringify({ at: 'pipelineLog.updateSourceRunCounts', sourceRunId, error: sanitiseError(e) }))
  }
}

export interface PipelineEvent {
  runId?: string | null
  job: PipelineJob
  stage: string
  severity: EventSeverity
  message?: string
  error?: unknown
  sourceKey?: string | null
  councilSlug?: string | null
  detail?: Record<string, unknown> | null
  retryCount?: number
  recovered?: boolean | null
}

export async function logPipelineEvent(db: AdminClient, event: PipelineEvent): Promise<void> {
  const message = event.message
    ? sanitiseMessage(event.error === undefined ? event.message : `${event.message}: ${sanitiseError(event.error)}`)
    : event.error !== undefined
      ? sanitiseError(event.error)
      : 'Unspecified pipeline event'
  const row = {
    run_id: event.runId ?? null,
    job: event.job,
    stage: event.stage,
    severity: event.severity,
    source_key: event.sourceKey ?? null,
    council_slug: event.councilSlug ?? null,
    message,
    detail: event.detail ?? null,
    retry_count: event.retryCount ?? 0,
    recovered: event.recovered ?? null,
  }
  const line = JSON.stringify({ at: 'pipeline', ...row })
  if (event.severity === 'info') console.log(line)
  else console.error(line)
  try {
    const { error } = await db.from('pipeline_events').insert(row)
    if (error) throw error
  } catch (e) {
    console.error(JSON.stringify({ at: 'pipelineLog.logPipelineEvent', error: sanitiseError(e) }))
  }
}
