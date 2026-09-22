// Health of one data source, from its recent run history.
//
// A run that "succeeds" with zero records is the failure this exists for: the
// August outage completed every morning and wrote nothing. So the count is
// judged against the source's own recent history, not just the HTTP status.
//
// The expected range is the min–max of recent comparable successful runs,
// widened by 20% each way — deliberately simple, so the page can state it in
// one sentence ("normally 35–55 over the last 14 runs") and anyone can check
// it. Comparable means the same window length: a 30-day rolling query and a
// 60-day recovery query are different measurements.
//
// Free of runtime imports so it can be tested with node --test.

export type HealthStatus = 'healthy' | 'warning' | 'degraded' | 'failed' | 'unknown'
export type RunStatus = 'success' | 'partial' | 'failed' | 'skipped'

export interface RunSample {
  started_at: string
  status: RunStatus
  records_returned: number | null
  truncated?: boolean | null
  window_days?: number | null
  error_message?: string | null
  http_status?: number | null
  duration_ms?: number | null
}

export interface SourceHealth {
  status: HealthStatus
  reasons: string[]
  lastAttemptAt: string | null
  lastSuccessAt: string | null
  lastCount: number | null
  expectedRange: { low: number; high: number } | null
  baselineSamples: number
  averageCount: number | null
  consecutiveFailures: number
  lastError: string | null
  lastDurationMs: number | null
}

export interface HealthOptions {
  /** How often the source is expected to run. Daily ingest by default. */
  expectedIntervalHours?: number
  /** How many comparable runs to learn the normal range from. */
  baselineRuns?: number
}

const SEVERITY: Record<HealthStatus, number> = { unknown: 0, healthy: 1, warning: 2, degraded: 3, failed: 4 }
export const MIN_BASELINE = 3

function worst(a: HealthStatus, b: HealthStatus): HealthStatus {
  return SEVERITY[b] > SEVERITY[a] ? b : a
}

function hoursSince(iso: string, now: Date): number {
  return (now.getTime() - new Date(iso).getTime()) / 3_600_000
}

export function expectedRange(counts: number[]): { low: number; high: number } | null {
  if (counts.length < MIN_BASELINE) return null
  return { low: Math.floor(Math.min(...counts) * 0.8), high: Math.ceil(Math.max(...counts) * 1.2) }
}

export function assessSourceHealth(runs: RunSample[], now: Date = new Date(), opts: HealthOptions = {}): SourceHealth {
  const interval = opts.expectedIntervalHours ?? 24
  const baselineRuns = opts.baselineRuns ?? 14
  const ordered = runs
    .filter((r) => r.status !== 'skipped')
    .sort((a, b) => b.started_at.localeCompare(a.started_at))

  const empty: SourceHealth = {
    status: 'unknown',
    reasons: ['No runs recorded yet'],
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastCount: null,
    expectedRange: null,
    baselineSamples: 0,
    averageCount: null,
    consecutiveFailures: 0,
    lastError: null,
    lastDurationMs: null,
  }
  if (ordered.length === 0) return empty

  const latest = ordered[0]
  let consecutiveFailures = 0
  for (const r of ordered) {
    if (r.status !== 'failed') break
    consecutiveFailures++
  }
  const lastSuccess = ordered.find((r) => r.status === 'success' || r.status === 'partial') ?? null
  const lastFailure = ordered.find((r) => r.status === 'failed') ?? null

  const reference = lastSuccess
  const comparable = ordered
    .filter((r) => r !== reference && (r.status === 'success' || r.status === 'partial'))
    .filter((r) => (r.window_days ?? null) === (reference?.window_days ?? null))
    .filter((r) => typeof r.records_returned === 'number')
    .slice(0, baselineRuns)
    .map((r) => r.records_returned as number)
  const range = expectedRange(comparable)
  const averageCount = comparable.length > 0 ? Math.round(comparable.reduce((a, b) => a + b, 0) / comparable.length) : null

  let status: HealthStatus = 'healthy'
  const reasons: string[] = []

  if (latest.status === 'failed') {
    const sinceSuccess = lastSuccess ? hoursSince(lastSuccess.started_at, now) : Infinity
    const rateLimitedRecently =
      latest.http_status === 429 &&
      consecutiveFailures === 1 &&
      sinceSuccess <= interval * 1.5
    const severe = consecutiveFailures >= 3 || sinceSuccess > interval * 2
    status = worst(status, rateLimitedRecently ? 'warning' : severe ? 'failed' : 'degraded')
    reasons.push(
      `${rateLimitedRecently ? 'Rate-limited once after a recent success' : `${consecutiveFailures} consecutive failed attempt${consecutiveFailures === 1 ? '' : 's'}`}` +
        (latest.error_message ? `: ${latest.error_message}` : ''),
    )
    if (!lastSuccess) reasons.push('No successful run on record')
  } else {
    const count = latest.records_returned
    if (range && typeof count === 'number') {
      if (count === 0 && range.low >= MIN_BASELINE) {
        status = worst(status, 'failed')
        reasons.push(`CRITICAL: returned 0 applications; normal range is ${range.low}–${range.high} (100% below normal range)`)
      } else if (count < range.low) {
        const below = Math.round(((range.low - count) / range.low) * 100)
        status = worst(status, below >= 50 ? 'degraded' : 'warning')
        reasons.push(`Returned ${count}; ${below}% below the normal range of ${range.low}–${range.high}`)
      } else if (count > range.high && range.high > 0) {
        const above = Math.round(((count - range.high) / range.high) * 100)
        status = worst(status, 'warning')
        reasons.push(`Returned ${count}; ${above}% above the normal range of ${range.low}–${range.high} — check for duplication or a changed query`)
      }
    } else if (comparable.length < MIN_BASELINE) {
      reasons.push(`Normal range still forming (${comparable.length} comparable run${comparable.length === 1 ? '' : 's'})`)
    }
    if (latest.truncated) {
      status = worst(status, 'degraded')
      reasons.push('Source reported more records than were retrieved (results truncated)')
    }
    if (latest.status === 'partial') {
      status = worst(status, 'warning')
      reasons.push('Last run only partly completed')
    }
  }

  const sinceAttempt = hoursSince(latest.started_at, now)
  if (sinceAttempt > interval * 3) {
    status = worst(status, 'degraded')
    reasons.push(`No attempt in ${Math.floor(sinceAttempt)} hours (expected every ${interval})`)
  } else if (sinceAttempt > interval * 1.5) {
    status = worst(status, 'warning')
    reasons.push(`No attempt in ${Math.floor(sinceAttempt)} hours (expected every ${interval})`)
  }

  return {
    status,
    reasons,
    lastAttemptAt: latest.started_at,
    lastSuccessAt: lastSuccess?.started_at ?? null,
    lastCount: lastSuccess?.records_returned ?? null,
    expectedRange: range,
    baselineSamples: comparable.length,
    averageCount,
    consecutiveFailures,
    lastError: lastFailure?.error_message ?? null,
    lastDurationMs: latest.duration_ms ?? null,
  }
}

export function summariseHealth(statuses: HealthStatus[]): Record<HealthStatus, number> {
  const out: Record<HealthStatus, number> = { healthy: 0, warning: 0, degraded: 0, failed: 0, unknown: 0 }
  for (const s of statuses) out[s]++
  return out
}

export function severityOf(status: HealthStatus): number {
  return SEVERITY[status]
}
