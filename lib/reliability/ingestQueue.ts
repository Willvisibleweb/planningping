// When a queued source should next be tried, and when to stop trying today.
//
// The old ingest was one function that walked every territory in a single
// invocation. It died three ways: Vercel killed it at 300s, PlanIt rate-limited
// the back half of the list, and a failure anywhere cost the rest of the run.
// Splitting it into queued per-source jobs fixes the first two; this module is
// the third — the policy that decides when a failed source gets another go.
//
// Two backoff ladders, because the two failures mean different things:
//
//   a 429 means PlanIt is saturated right now and the only useful response is
//     to wait longer than we would for anything else — retrying sooner makes
//     it worse for every other source in the queue;
//   anything else (a 500, a timeout, a parse failure) is more likely
//     transient or specific to that source, so it is retried sooner.
//
// Giving up is per day, not permanent. A source that exhausts its attempts is
// simply not fetched today, and tomorrow's planner queues it again — by which
// point planSubmissionWindow reaches back to its last success, so the missed
// day is recovered rather than lost. That is why there is no separate retry
// queue table: the recovery window IS the retry.
//
// Free of runtime imports so it can be tested with node --test.

export type JobStatus = 'pending' | 'running' | 'done' | 'failed'

/** Attempts a source gets in one day before it waits for tomorrow's planner. */
export const MAX_ATTEMPTS = 6

/** Minutes to wait after the Nth consecutive failure. Index 0 = after attempt 1. */
const BACKOFF_MINUTES = [5, 15, 45, 120, 360]
const RATE_LIMIT_BACKOFF_MINUTES = [20, 60, 180, 360, 720]

/**
 * How long to wait before retrying a source that has just failed.
 *
 * `attempts` is the number of attempts made including the one that just
 * failed, so the first failure passes 1.
 */
export function backoffMinutes(attempts: number, opts: { rateLimited?: boolean } = {}): number {
  const ladder = opts.rateLimited ? RATE_LIMIT_BACKOFF_MINUTES : BACKOFF_MINUTES
  const index = Math.min(Math.max(attempts, 1), ladder.length) - 1
  return ladder[index]
}

/**
 * Spread retries so sources that failed together do not all come back at the
 * same moment and rate-limit us again. Deterministic in the source key rather
 * than random, so a retry time can be explained after the fact.
 */
export function jitterSeconds(sourceKey: string, spreadSeconds = 120): number {
  let hash = 0
  for (let i = 0; i < sourceKey.length; i++) hash = (hash * 31 + sourceKey.charCodeAt(i)) >>> 0
  return hash % Math.max(spreadSeconds, 1)
}

export interface RetryDecision {
  /** 'pending' to try again today, 'failed' to leave it for tomorrow. */
  status: Extract<JobStatus, 'pending' | 'failed'>
  nextAttemptAt: string | null
  waitMinutes: number | null
  reason: string
}

export function planRetry(
  attempts: number,
  opts: { rateLimited?: boolean; sourceKey: string; now?: Date; maxAttempts?: number } = { sourceKey: '' },
): RetryDecision {
  const now = opts.now ?? new Date()
  const maxAttempts = opts.maxAttempts ?? MAX_ATTEMPTS

  if (attempts >= maxAttempts) {
    return {
      status: 'failed',
      nextAttemptAt: null,
      waitMinutes: null,
      reason: `Gave up after ${attempts} attempts today; tomorrow's run will recover the missed window`,
    }
  }

  const waitMinutes = backoffMinutes(attempts, opts)
  const waitMs = waitMinutes * 60_000 + jitterSeconds(opts.sourceKey) * 1000
  return {
    status: 'pending',
    nextAttemptAt: new Date(now.getTime() + waitMs).toISOString(),
    waitMinutes,
    reason: `Attempt ${attempts} failed${opts.rateLimited ? ' (rate limited)' : ''}; retrying in ${waitMinutes} minutes`,
  }
}

/**
 * A lease that has expired means the worker holding it died mid-job — Vercel
 * killed the function, the deploy rolled. The row would otherwise sit in
 * 'running' forever, invisible to both the queue and the health page.
 */
export function isLeaseExpired(claimedAt: string | null, leaseSeconds: number, now: Date = new Date()): boolean {
  if (!claimedAt) return false
  return now.getTime() - new Date(claimedAt).getTime() > leaseSeconds * 1000
}

export interface QueueProgress {
  total: number
  done: number
  failed: number
  pending: number
  running: number
}

export function summariseQueue(jobs: Array<{ status: JobStatus }>): QueueProgress {
  const progress: QueueProgress = { total: jobs.length, done: 0, failed: 0, pending: 0, running: 0 }
  for (const job of jobs) progress[job.status]++
  return progress
}

/**
 * Is the day's queue finished? Used by the finaliser to decide whether the tail
 * work (digest, discharge sweep, closing the run) can happen yet. 'failed'
 * counts as finished: a source that has given up for today is not coming back.
 */
export function isQueueComplete(progress: QueueProgress): boolean {
  return progress.total > 0 && progress.pending === 0 && progress.running === 0
}
