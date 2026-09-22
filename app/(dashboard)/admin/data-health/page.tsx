// Internal reliability dashboard. Not linked from the navigation: reached by
// URL, and a 404 for anyone not on the ADMIN_EMAILS allowlist, so its
// existence is not advertised. Every query runs server-side through the
// service role; nothing here is sent to the browser except the rendered page.
//
// Every number on this page is counted from stored rows. Where there is
// nothing to count yet (no benchmark results, no run history) the page says
// so instead of showing a figure.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getProfile } from '@/lib/access'
import { isAdmin } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadHealthReport } from '@/lib/reliability/healthReport'
import { computeBenchmarkMetrics, BENCHMARK_FIELDS, type BenchmarkItemResult, type Rate } from '@/lib/reliability/benchmark'
import type { HealthStatus } from '@/lib/reliability/sourceHealth'
import Badge from '@/components/ui/Badge'
import { reviewDuplicateCandidate } from './actions'

export const dynamic = 'force-dynamic'

const STATUS_TONE: Record<HealthStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  healthy: 'success',
  warning: 'warning',
  degraded: 'warning',
  failed: 'danger',
  unknown: 'neutral',
}
const STATUS_LABEL: Record<HealthStatus, string> = {
  healthy: 'Healthy',
  warning: 'Warning',
  degraded: 'Degraded',
  failed: 'Failed',
  unknown: 'No runs yet',
}

function when(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/London',
  }).format(new Date(iso))
}

// Module-level so the render stays pure: the window is fixed when the query is
// built, not recomputed on re-render.
async function collapsedInLast24h(db: ReturnType<typeof createAdminClient>): Promise<number> {
  const since = new Date(Date.now() - 86_400_000).toISOString()
  const { data } = await db.from('pipeline_runs').select('summary').gte('started_at', since)
  return (data ?? [])
    .map((r) => (r.summary ?? {}) as Record<string, unknown>)
    .reduce((sum, s) => sum + (Number(s.collapsed_in_batch) || 0) + (Number(s.reference_variants_resolved) || 0), 0)
}

function pct(rate: Rate): string {
  return rate.value === null ? 'Not measured' : `${(rate.value * 100).toFixed(1)}%`
}

function Panel({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-border bg-surface p-4 shadow-sm sm:p-5">
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      {hint && <p className="mt-1 text-xs leading-relaxed text-ink-muted">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-md border border-border bg-surface p-4 shadow-sm">
      <p className="text-2xs font-semibold uppercase tracking-wider text-ink-muted">{label}</p>
      <p className="tabular-data mt-1 text-2xl font-semibold text-ink">{typeof value === 'number' ? value.toLocaleString('en-GB') : value}</p>
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </div>
  )
}

interface Overview {
  applications_total: number
  seen_last_24h: number
  written_today: number
  new_today: number
  not_seen_14d: number
  missing_source_url: number
  missing_status: number
  missing_description: number
  missing_address: number
  missing_application_date: number
  missing_location: number
  legacy_source: number
  open_duplicate_candidates: number
  changes_last_7d: number
  status_changes_last_7d: number
}

interface EventRow {
  id: number
  occurred_at: string
  job: string
  stage: string
  severity: string
  source_key: string | null
  council_slug: string | null
  message: string
  retry_count: number
  recovered: boolean | null
}

interface DuplicateRow {
  id: string
  match_type: string
  confidence: string
  evidence: Record<string, unknown> | null
  detected_at: string
  a: { id: string; reference: string; council_slug: string } | null
  b: { id: string; reference: string; council_slug: string } | null
}

export default async function DataHealthPage() {
  const profile = await getProfile()
  if (!isAdmin(profile)) notFound()

  const db = createAdminClient()

  const [report, overviewRes, eventsRes, duplicatesRes, setsRes, itemsRes, collapsed24h] = await Promise.all([
    loadHealthReport(db),
    db.rpc('reliability_overview'),
    db
      .from('pipeline_events')
      .select('id, occurred_at, job, stage, severity, source_key, council_slug, message, retry_count, recovered')
      .in('severity', ['warning', 'error', 'critical'])
      .order('occurred_at', { ascending: false })
      .limit(40),
    db
      .from('duplicate_candidates')
      .select('id, match_type, confidence, evidence, detected_at, a:planning_applications!duplicate_candidates_application_id_fkey(id, reference, council_slug), b:planning_applications!duplicate_candidates_candidate_id_fkey(id, reference, council_slug)')
      .eq('status', 'open')
      .order('detected_at', { ascending: false })
      .limit(30),
    db.from('benchmark_sets').select('id, name, external_source, created_at').order('created_at', { ascending: false }),
    db.from('benchmark_items').select('set_id, found, reference_verdict, address_verdict, applicant_verdict, description_verdict, status_verdict, source_url_verdict, duplicate_count, ai_claims_checked, ai_unsupported_claims, classification_verdict, detection_delay_days').limit(5000),
    collapsedInLast24h(db),
  ])

  if (!report.available || overviewRes.error) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Data health</h1>
        <p className="rounded-md border border-warning-200 bg-warning-50 p-4 text-sm text-ink">
          The reliability tables are not available. Apply <code>supabase/migrations/0036_data_reliability.sql</code> and reload.
        </p>
      </div>
    )
  }

  const overview = overviewRes.data as Overview
  const events = (eventsRes.data ?? []) as EventRow[]
  const duplicates = ((duplicatesRes.data ?? []) as unknown as Array<Omit<DuplicateRow, 'a' | 'b'> & { a: DuplicateRow['a'] | DuplicateRow['a'][]; b: DuplicateRow['b'] | DuplicateRow['b'][] }>).map((d) => ({
    ...d,
    a: Array.isArray(d.a) ? d.a[0] ?? null : d.a,
    b: Array.isArray(d.b) ? d.b[0] ?? null : d.b,
  })) as DuplicateRow[]

  const recentRuns = report.lastIngest ? [report.lastIngest] : []

  const total = overview.applications_total || 0
  const share = (n: number) => (total > 0 ? `${((n / total) * 100).toFixed(1)}%` : '—')
  const completeness: Array<[string, number]> = [
    ['No link to original record', overview.missing_source_url],
    ['No status', overview.missing_status],
    ['No usable description', overview.missing_description],
    ['No usable address', overview.missing_address],
    ['No submission date', overview.missing_application_date],
    ['No map location', overview.missing_location],
    ['From retired scraper (unlinked)', overview.legacy_source],
    ['Not re-confirmed in 14 days', overview.not_seen_14d],
  ]

  const sets = (setsRes.data ?? []) as { id: string; name: string; external_source: string | null; created_at: string }[]
  const items = (itemsRes.data ?? []) as Array<BenchmarkItemResult & { set_id: string }>

  return (
    <div className="space-y-6">
      <header className="border-b border-border pb-5">
        <p className="text-2xs font-semibold uppercase tracking-wider text-primary-600">Internal</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">Data health</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Source health, pipeline errors, duplicates and benchmark results. Counted from stored runs and records only.
        </p>
      </header>

      {(report.ingestOverdue || report.stuckRuns.length > 0) && (
        <div className="rounded-md border border-danger-200 bg-danger-50 p-4 text-sm text-ink">
          {report.ingestOverdue && (
            <p><strong>The daily ingest has not started in over 26 hours.</strong> Last run: {when(report.lastIngest?.started_at)}. Check the Vercel cron.</p>
          )}
          {report.stuckRuns.map((r) => (
            <p key={r.id}>A <strong>{r.job}</strong> run started {when(r.started_at)} never finished — it was probably killed at the time limit.</p>
          ))}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Healthy sources" value={report.counts.healthy} />
        <Stat label="Warnings" value={report.counts.warning + report.counts.degraded} hint={`${report.counts.degraded} degraded`} />
        <Stat label="Failed sources" value={report.counts.failed} hint={report.counts.unknown ? `${report.counts.unknown} not yet run` : undefined} />
        <Stat label="Last ingest" value={report.lastIngest ? report.lastIngest.status : 'none'} hint={when(report.lastIngest?.started_at)} />
        <Stat label="Confirmed against source (24h)" value={overview.seen_last_24h} hint={`of ${total.toLocaleString('en-GB')} stored`} />
        <Stat label="New applications today" value={overview.new_today} />
        <Stat label="Duplicate records collapsed (24h)" value={collapsed24h} hint="Overlapping queries and reference variants" />
        <Stat label="Possible duplicates to review" value={overview.open_duplicate_candidates} hint={`${overview.status_changes_last_7d} status changes recorded in 7 days`} />
      </div>

      <Panel title="Sources" hint="Territory queries run daily; authorities in the national rotation are revisited roughly monthly. The expected range is the min–max of recent comparable runs, widened by 20%.">
        {report.sources.length === 0 ? (
          <p className="text-sm text-ink-muted">No sources recorded yet. They appear after the next ingest run.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="text-2xs uppercase tracking-wider text-ink-muted">
                <tr className="border-b border-border">
                  <th className="py-2 pr-3 font-semibold">Source</th>
                  <th className="py-2 pr-3 font-semibold">Status</th>
                  <th className="py-2 pr-3 font-semibold">Last attempt</th>
                  <th className="py-2 pr-3 font-semibold">Last success</th>
                  <th className="py-2 pr-3 text-right font-semibold">Records</th>
                  <th className="py-2 pr-3 font-semibold">Expected</th>
                  <th className="py-2 font-semibold">Why</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {report.sources.map((s) => (
                  <tr key={s.sourceKey} className="align-top">
                    <td className="py-2.5 pr-3">
                      <p className="font-medium text-ink">{s.label}</p>
                      <p className="text-xs text-ink-muted">{s.kind === 'authority' ? 'Authority rotation' : s.sourceKey.replace('planit:area:', '')}{s.councilSlug ? ` · ${s.councilSlug}` : ''}</p>
                    </td>
                    <td className="py-2.5 pr-3"><Badge tone={STATUS_TONE[s.status]}>{STATUS_LABEL[s.status]}</Badge></td>
                    <td className="py-2.5 pr-3 text-ink-muted">{when(s.lastAttemptAt)}</td>
                    <td className="py-2.5 pr-3 text-ink-muted">{when(s.lastSuccessAt)}</td>
                    <td className="tabular-data py-2.5 pr-3 text-right text-ink">{s.lastCount ?? '—'}</td>
                    <td className="tabular-data py-2.5 pr-3 text-ink-muted">{s.expectedRange ? `${s.expectedRange.low}–${s.expectedRange.high}` : `forming (${s.baselineSamples})`}</td>
                    <td className="py-2.5 text-xs leading-relaxed text-ink-muted">
                      {s.reasons.length > 0 ? s.reasons.join(' · ') : 'Within normal range'}
                      {s.consecutiveFailures > 0 && s.lastError ? <span className="block text-danger-600">{s.lastError}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Recent pipeline problems" hint="Warnings and errors written by the ingest, backfills and add-territory fetches. Messages are sanitised; full traces stay in the Vercel logs.">
        {events.length === 0 ? (
          <p className="text-sm text-ink-muted">No warnings or errors recorded.</p>
        ) : (
          <ul className="divide-y divide-border">
            {events.map((e) => (
              <li key={e.id} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-start sm:gap-3">
                <span className="w-32 shrink-0 text-xs text-ink-muted">{when(e.occurred_at)}</span>
                <Badge tone={e.severity === 'warning' ? 'warning' : 'danger'} className="shrink-0 self-start">{e.severity}</Badge>
                <div className="min-w-0 text-sm">
                  <p className="text-ink">{e.message}</p>
                  <p className="text-xs text-ink-muted">
                    {e.job} · {e.stage}{e.source_key ? ` · ${e.source_key}` : ''}{e.council_slug ? ` · ${e.council_slug}` : ''}
                    {e.retry_count > 0 ? ` · ${e.retry_count} retr${e.retry_count === 1 ? 'y' : 'ies'}` : ''}
                    {e.recovered === true ? ' · recovered' : ''}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Data completeness" hint={`Share of all ${total.toLocaleString('en-GB')} stored applications missing each item.`}>
          <dl className="divide-y divide-border text-sm">
            {completeness.map(([label, n]) => (
              <div key={label} className="flex items-center justify-between py-2">
                <dt className="text-ink-muted">{label}</dt>
                <dd className="tabular-data text-ink">{n.toLocaleString('en-GB')} <span className="text-ink-muted">({share(n)})</span></dd>
              </div>
            ))}
          </dl>
        </Panel>

        <Panel title="Possible duplicates" hint="Flagged at ingest for review. Nothing is merged automatically; confirming only records the judgement.">
          {duplicates.length === 0 ? (
            <p className="text-sm text-ink-muted">Nothing waiting for review.</p>
          ) : (
            <ul className="divide-y divide-border">
              {duplicates.map((d) => (
                <li key={d.id} className="py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={d.confidence === 'high' ? 'danger' : d.confidence === 'medium' ? 'warning' : 'neutral'}>{d.confidence}</Badge>
                    <span className="text-xs text-ink-muted">{d.match_type.replace(/_/g, ' ')} · {when(d.detected_at)}</span>
                  </div>
                  <p className="mt-1.5">
                    {d.a ? <Link className="pp-link" href={`/applications/${d.a.id}`}>{d.a.council_slug} {d.a.reference}</Link> : 'deleted'}
                    {' ↔ '}
                    {d.b ? <Link className="pp-link" href={`/applications/${d.b.id}`}>{d.b.council_slug} {d.b.reference}</Link> : 'deleted'}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <form action={reviewDuplicateCandidate}>
                      <input type="hidden" name="id" value={d.id} />
                      <input type="hidden" name="verdict" value="confirmed_duplicate" />
                      <button className="rounded-sm border border-border px-2.5 py-1 text-xs font-medium text-ink hover:border-primary-300 hover:bg-primary-50">Confirm duplicate</button>
                    </form>
                    <form action={reviewDuplicateCandidate}>
                      <input type="hidden" name="id" value={d.id} />
                      <input type="hidden" name="verdict" value="not_duplicate" />
                      <button className="rounded-sm border border-border px-2.5 py-1 text-xs font-medium text-ink hover:border-primary-300 hover:bg-primary-50">Not a duplicate</button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Benchmarks" hint="Measured only from benchmark results stored with tools/benchmark.mjs. Needs-review verdicts are excluded from accuracy until a person decides them.">
        {sets.length === 0 ? (
          <p className="text-sm text-ink-muted">No benchmark results recorded yet, so no accuracy figures are shown.</p>
        ) : (
          <div className="space-y-5">
            {sets.map((set) => {
              const m = computeBenchmarkMetrics(items.filter((i) => i.set_id === set.id))
              return (
                <div key={set.id}>
                  <p className="text-sm font-semibold text-ink">{set.name}{set.external_source ? ` — vs ${set.external_source}` : ''}</p>
                  <p className="text-xs text-ink-muted">{m.items} records</p>
                  <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                    <div><dt className="text-xs text-ink-muted">Coverage</dt><dd className="tabular-data text-ink">{pct(m.coverage)} <span className="text-xs text-ink-muted">({m.coverage.numerator}/{m.coverage.denominator})</span></dd></div>
                    <div><dt className="text-xs text-ink-muted">Duplicate rate</dt><dd className="tabular-data text-ink">{pct(m.duplicateRate)}</dd></div>
                    <div><dt className="text-xs text-ink-muted">Unsupported AI claims</dt><dd className="tabular-data text-ink">{pct(m.unsupportedClaimRate)} <span className="text-xs text-ink-muted">({m.unsupportedClaimRate.numerator}/{m.unsupportedClaimRate.denominator} claims)</span></dd></div>
                    <div><dt className="text-xs text-ink-muted">Detection delay</dt><dd className="tabular-data text-ink">{m.averageDetectionDelayDays === null ? 'Not measured' : `${m.averageDetectionDelayDays.toFixed(1)} days avg · ${m.medianDetectionDelayDays?.toFixed(1)} median`}</dd></div>
                    {BENCHMARK_FIELDS.map((f) => (
                      <div key={f}>
                        <dt className="text-xs capitalize text-ink-muted">{f.replace('_', ' ')} accuracy</dt>
                        <dd className="tabular-data text-ink">{pct(m.fieldAccuracy[f])} <span className="text-xs text-ink-muted">({m.fieldAccuracy[f].numerator}/{m.fieldAccuracy[f].denominator}{m.fieldAccuracy[f].pendingReview ? `, ${m.fieldAccuracy[f].pendingReview} to review` : ''})</span></dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )
            })}
          </div>
        )}
      </Panel>

      {recentRuns.length > 0 && report.lastIngest?.summary && (
        <Panel title="Last ingest summary">
          <pre className="overflow-x-auto rounded-sm bg-neutral-50 p-3 text-xs text-ink">{JSON.stringify(report.lastIngest.summary, null, 2)}</pre>
        </Panel>
      )}
    </div>
  )
}
