// Which dates to ask the source for.
//
// Two separate questions, because PlanIt answers them with separate filters
// (both verified against the live API on 2026-09-14):
//
//   start_date/end_date — applications SUBMITTED in a window. The daily ingest
//     used `recent=30`, which is exactly this. It means an application older
//     than 30 days is never returned again, so a decision made in week eight
//     was never seen: 92% of stored rows have no decision date.
//
//   different_start — applications whose CONTENT CHANGED since a date,
//     however old they are. This is what catches status changes and decisions.
//
// Recovery: if the last successful sync is older than the rolling window can
// reach, the submission window stretches back to it (plus an overlap) so an
// outage does not permanently lose what was published during it. Capped so a
// territory dead for a year cannot turn one run into a year-long crawl — that
// is what backfill-history is for, and the result says so.
//
// Free of runtime imports so it can be tested with node --test.

export const ROLLING_DAYS = 30
export const OVERLAP_DAYS = 3
export const MAX_RECOVERY_DAYS = 90
export const MAX_CHANGE_DAYS = 30
const DAY_MS = 86_400_000

export function ymd(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export interface SubmissionWindow {
  startDate: string
  endDate: string
  days: number
  mode: 'rolling' | 'recovery'
  /** True when the gap was longer than one run may recover. */
  capped: boolean
  reason: string
}

export function planSubmissionWindow(lastSuccessAt: string | null, now: Date = new Date()): SubmissionWindow {
  const end = ymd(now)
  const rollingStart = ymd(new Date(now.getTime() - ROLLING_DAYS * DAY_MS))
  if (!lastSuccessAt) {
    return { startDate: rollingStart, endDate: end, days: ROLLING_DAYS, mode: 'rolling', capped: false, reason: 'First sync: rolling window' }
  }
  const gapDays = (now.getTime() - new Date(lastSuccessAt).getTime()) / DAY_MS
  const needed = Math.ceil(gapDays) + OVERLAP_DAYS
  if (needed <= ROLLING_DAYS) {
    return { startDate: rollingStart, endDate: end, days: ROLLING_DAYS, mode: 'rolling', capped: false, reason: 'Rolling window covers the gap since the last sync' }
  }
  const days = Math.min(needed, MAX_RECOVERY_DAYS)
  const capped = needed > MAX_RECOVERY_DAYS
  return {
    startDate: ymd(new Date(now.getTime() - days * DAY_MS)),
    endDate: end,
    days,
    mode: 'recovery',
    capped,
    reason: capped
      ? `Last successful sync was ${Math.floor(gapDays)} days ago; recovering the most recent ${MAX_RECOVERY_DAYS} days — run backfill-history for the rest`
      : `Recovering ${Math.floor(gapDays)} days since the last successful sync (with ${OVERLAP_DAYS}-day overlap)`,
  }
}

export interface ChangeWindow {
  differentStart: string
  days: number
  capped: boolean
}

/** Content-change window: since the last successful sync, minus an overlap. */
export function planChangeWindow(lastSuccessAt: string | null, now: Date = new Date()): ChangeWindow {
  const gapDays = lastSuccessAt ? (now.getTime() - new Date(lastSuccessAt).getTime()) / DAY_MS : 1
  const needed = Math.max(Math.ceil(gapDays), 1) + 1
  const days = Math.min(needed, MAX_CHANGE_DAYS)
  return { differentStart: ymd(new Date(now.getTime() - days * DAY_MS)), days, capped: needed > MAX_CHANGE_DAYS }
}
