// Source health across the pipeline, for the admin page and the public health
// endpoint. Server-only: reads through the service role.
//
// A source is a territory query (planit:area:...) or an authority in the
// national rotation (planit:authority:...). History backfill runs are manual
// and excluded from health — their failures still appear as pipeline events.

import type { createAdminClient } from '@/lib/supabase/admin'
import { assessSourceHealth, summariseHealth, severityOf, type HealthStatus, type RunSample, type SourceHealth } from '@/lib/reliability/sourceHealth'
import { areaSourceKey, isAuthoritySource } from '@/lib/reliability/sourceKeys'

type AdminClient = ReturnType<typeof createAdminClient>

export interface SourceHealthRow extends SourceHealth {
  sourceKey: string
  label: string
  councilSlug: string | null
  kind: 'territory' | 'authority'
}

export interface PipelineRunRow {
  id: string
  job: string
  trigger: string
  started_at: string
  finished_at: string | null
  status: string
  summary: Record<string, unknown> | null
}

export interface HealthReport {
  /** False when the reliability tables are not there yet (0036 not applied). */
  available: boolean
  sources: SourceHealthRow[]
  counts: Record<HealthStatus, number>
  /**
   * Counts for tracked territories only — the sources a customer's data
   * actually depends on.
   *
   * The national council backfill is opportunistic growth: it walks 418
   * authorities a batch at a time, and a council it meets for the first time
   * routinely answers 429. That is a source with no successful run on record,
   * which assessSourceHealth rightly calls 'failed' — but it is not an outage,
   * and folding it into the public pass/fail meant the health endpoint would
   * sit at 503 for as long as coverage kept expanding. A monitor that is
   * always red tells you nothing.
   */
  territoryCounts: Record<HealthStatus, number>
  lastIngest: PipelineRunRow | null
  /** The daily ingest has not started in over 26 hours. */
  ingestOverdue: boolean
  /** Runs still marked running 15+ minutes after they started: killed mid-run. */
  stuckRuns: PipelineRunRow[]
}

const LOOKBACK_DAYS = 60
const PAGE = 1000
const MAX_PAGES = 10
const DAILY_HOURS = 24
// ~410 authorities at 15 a day: each is revisited roughly every four weeks.
const AUTHORITY_ROTATION_HOURS = 24 * 35

interface SourceRunRow extends RunSample {
  source_key: string
  source_label: string | null
  council_slug: string | null
}

export async function loadHealthReport(db: AdminClient, now: Date = new Date()): Promise<HealthReport> {
  const since = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000).toISOString()
  const runs: SourceRunRow[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await db
      .from('source_runs')
      .select('source_key, source_label, council_slug, started_at, status, records_returned, truncated, window_days, error_message, http_status, duration_ms')
      .gte('started_at', since)
      .order('started_at', { ascending: false })
      .range(page * PAGE, page * PAGE + PAGE - 1)
    if (error) {
      return { available: false, sources: [], counts: summariseHealth([]), territoryCounts: summariseHealth([]), lastIngest: null, ingestOverdue: false, stuckRuns: [] }
    }
    runs.push(...((data ?? []) as SourceRunRow[]))
    if (!data || data.length < PAGE) break
  }

  const [{ data: areas }, { data: pipelineRuns }] = await Promise.all([
    db.from('tracked_areas').select('postcode, radius_metres, label, council_slug').eq('is_active', true),
    db.from('pipeline_runs').select('id, job, trigger, started_at, finished_at, status, summary').order('started_at', { ascending: false }).limit(50),
  ])

  // Territory sources are the active tracked areas, including any that have
  // never been attempted. Areas that were deactivated drop out.
  const activeAreas = new Map<string, { label: string; councilSlug: string | null }>()
  for (const a of (areas ?? []) as { postcode: string; radius_metres: number | null; label: string; council_slug: string }[]) {
    const km = Math.max((a.radius_metres ?? 800) / 1000, 0.5)
    const key = areaSourceKey(a.postcode, km)
    if (!activeAreas.has(key)) activeAreas.set(key, { label: a.label, councilSlug: a.council_slug })
  }

  const byKey = new Map<string, SourceRunRow[]>()
  for (const r of runs) {
    if (r.source_key.endsWith(':history')) continue
    const list = byKey.get(r.source_key) ?? []
    list.push(r)
    byKey.set(r.source_key, list)
  }

  const sources: SourceHealthRow[] = []
  for (const [key, meta] of activeAreas) {
    const list = byKey.get(key) ?? []
    sources.push({
      ...assessSourceHealth(list, now, { expectedIntervalHours: DAILY_HOURS }),
      sourceKey: key,
      label: meta.label,
      councilSlug: meta.councilSlug,
      kind: 'territory',
    })
  }
  for (const [key, list] of byKey) {
    if (!isAuthoritySource(key)) continue
    sources.push({
      ...assessSourceHealth(list, now, { expectedIntervalHours: AUTHORITY_ROTATION_HOURS }),
      sourceKey: key,
      label: list[0]?.source_label ?? key,
      councilSlug: list[0]?.council_slug ?? null,
      kind: 'authority',
    })
  }
  sources.sort((a, b) => severityOf(b.status) - severityOf(a.status) || a.label.localeCompare(b.label))

  const pipeline = (pipelineRuns ?? []) as PipelineRunRow[]
  const lastIngest = pipeline.find((r) => r.job === 'ingest') ?? null
  const ingestOverdue = !lastIngest || now.getTime() - new Date(lastIngest.started_at).getTime() > 26 * 3_600_000
  const stuckRuns = pipeline.filter((r) => r.status === 'running' && now.getTime() - new Date(r.started_at).getTime() > 15 * 60_000)

  return {
    available: true,
    sources,
    counts: summariseHealth(sources.map((s) => s.status)),
    territoryCounts: summariseHealth(sources.filter((s) => s.kind === 'territory').map((s) => s.status)),
    lastIngest,
    ingestOverdue,
    stuckRuns,
  }
}
