// Public data-quality page.
//
// The case a prospective customer or partner needs to make internally: how
// accurate the data is, how quickly it arrives, how much of the country is
// covered, and — the part most pages like this omit — where the gaps are.
//
// The figures are read live from stored rows rather than typed in, so re-running
// the audit updates the page and nobody has to remember to. Stating the limits
// is the point rather than a concession: a reader who finds a caveat we
// disclosed trusts the rest more, and one who finds a caveat we hid trusts
// none of it.
//
// Everything rendered here comes from lib/reliability/publicDataQuality.ts,
// which returns counts and rates only — see the note at the top of that file.

import type { Metadata } from 'next'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadPublicDataQuality } from '@/lib/reliability/publicDataQuality'

export const metadata: Metadata = {
  title: 'Data quality — PlanningPing',
  description:
    "How PlanningPing's planning data compares with councils' own public registers: accuracy, speed, coverage, and the gaps.",
}

// Counted from live rows, refreshed hourly. The underlying figures move at the
// pace of a daily ingest, so a per-visit query would cost more than it tells.
export const revalidate = 3600

function when(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' })
    .format(new Date(iso))
}

function Figure({ value, unit, label, note }: { value: string; unit?: string; label: string; note: string }) {
  return (
    <div className="flex-1 min-w-[10rem] border-t-2 border-primary-500 pt-3">
      <p className="text-xs uppercase tracking-wider text-ink-muted mb-2">{label}</p>
      <p className="text-3xl font-semibold tracking-tight text-ink tabular-nums">
        {value}
        {unit ? <span className="text-lg font-normal text-ink-muted ml-1">{unit}</span> : null}
      </p>
      <p className="text-xs leading-relaxed text-ink-muted mt-2">{note}</p>
    </div>
  )
}

export default async function DataQualityPage() {
  const { audit, coverage, freshness, generatedAt } = await loadPublicDataQuality(createAdminClient())

  const coveragePct = coverage.councilsKnown > 0
    ? Math.round((coverage.councilsWithData / coverage.councilsKnown) * 100)
    : 0

  return (
    <div className="min-h-screen flex flex-col bg-surface">
      <header className="border-b border-border">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="text-sm font-semibold tracking-tight text-ink">
            Planning<span className="text-primary-500">Ping</span>
          </Link>
          <Link href="/login" className="text-sm font-medium text-ink-muted hover:text-ink transition-colors">
            Sign in
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <div className="max-w-3xl mx-auto px-6 py-16">

          <p className="text-xs uppercase tracking-wider text-ink-muted mb-4">Data quality</p>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-ink mb-4 text-balance">
            Measured against the register
          </h1>
          <p className="text-base leading-relaxed text-ink-muted mb-10 max-w-xl">
            Planning data is only worth acting on if it matches what the council
            actually published. We check ours against councils&rsquo; own public
            registers and publish the result, including what it misses.
          </p>

          {/* ---- live status ---- */}
          <div className="flex flex-wrap gap-6 mb-14">
            <Figure
              value={freshness.hoursSinceLastFetch === null ? '—' : String(freshness.hoursSinceLastFetch)}
              unit={freshness.hoursSinceLastFetch === null ? undefined : 'h'}
              label="Last checked for new applications"
              note={freshness.allCurrent
                ? 'Every tracked area is within its freshness threshold.'
                : `Threshold is ${freshness.staleThresholdHours} hours.`}
            />
            <Figure
              value={coverage.councilsWithData.toLocaleString('en-GB')}
              unit={`of ${coverage.councilsKnown}`}
              label="Councils with data"
              note={`${coveragePct}% of UK planning authorities. Coverage is still expanding.`}
            />
            <Figure
              value={coverage.applicationsStored.toLocaleString('en-GB')}
              label="Applications held"
              note={`${coverage.applicationsLast30Days.toLocaleString('en-GB')} submitted in the last 30 days.`}
            />
          </div>

          {audit ? (
            <>
              {/* ---- accuracy ---- */}
              <section className="mb-14">
                <h2 className="text-lg font-semibold text-ink mb-1">What we hold is accurate</h2>
                <p className="text-sm leading-relaxed text-ink-muted mb-5">
                  {audit.items} applications across {audit.councils} councils, each
                  checked field by field against that council&rsquo;s own register
                  entry. Last run {when(audit.ranAt)}.
                </p>

                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border-strong">
                      <th scope="col" className="text-left font-medium text-xs uppercase tracking-wider text-ink-muted pb-2">Field</th>
                      <th scope="col" className="text-right font-medium text-xs uppercase tracking-wider text-ink-muted pb-2">Checked</th>
                      <th scope="col" className="text-right font-medium text-xs uppercase tracking-wider text-ink-muted pb-2">Agreement</th>
                    </tr>
                  </thead>
                  <tbody>
                    {audit.fields.map((f) => (
                      <tr key={f.label} className="border-b border-border">
                        <td className="py-2.5 text-ink">{f.label}</td>
                        <td className="py-2.5 text-right tabular-nums text-ink-muted">{f.checked}</td>
                        <td className="py-2.5 text-right tabular-nums font-medium text-success-600">
                          {f.agreement === null ? 'not measured' : `${f.agreement}%`}
                        </td>
                      </tr>
                    ))}
                    {audit.duplicateRatePct !== null && (
                      <tr className="border-b border-border">
                        <td className="py-2.5 text-ink">Duplicate entries</td>
                        <td className="py-2.5 text-right tabular-nums text-ink-muted">{audit.items}</td>
                        <td className="py-2.5 text-right tabular-nums font-medium text-success-600">
                          {audit.duplicateRatePct}%
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </section>

              {/* ---- speed ---- */}
              {audit.medianDelayDays !== null && (
                <section className="mb-14">
                  <h2 className="text-lg font-semibold text-ink mb-1">
                    Typically {audit.medianDelayDays} days behind the council
                  </h2>
                  <p className="text-sm leading-relaxed text-ink-muted mb-4">
                    Measured from the date the council validated the application to
                    the moment it first appeared in PlanningPing
                    {audit.meanDelayDays !== null
                      ? ` — a median of ${audit.medianDelayDays} days and a mean of ${audit.meanDelayDays}, across ${audit.delaySamples} applications.`
                      : `, across ${audit.delaySamples} applications.`}
                  </p>
                  <p className="text-sm leading-relaxed text-ink">
                    Most of that interval belongs to the national aggregator we draw
                    from, which republishes council registers on its own schedule.
                    Our own checks run every fifteen minutes. For context, a planning
                    application takes eight to thirteen weeks to determine.
                  </p>
                </section>
              )}
            </>
          ) : (
            <section className="mb-14 border border-border rounded-md p-5">
              <h2 className="text-lg font-semibold text-ink mb-1">Audit pending</h2>
              <p className="text-sm leading-relaxed text-ink-muted">
                No benchmark has been recorded yet. Figures appear here once one has
                been run; we would rather show nothing than an estimate.
              </p>
            </section>
          )}

          {/* ---- the honest part ---- */}
          <section className="mb-14">
            <h2 className="text-lg font-semibold text-ink mb-1">Where the gaps are</h2>
            <p className="text-sm leading-relaxed text-ink-muted mb-5">
              Accuracy answers whether what we show is correct. It cannot answer
              whether anything is missing, so we test that separately, by taking a
              council&rsquo;s complete published list and checking it against ours.
            </p>

            <dl className="space-y-4 text-sm">
              <div>
                <dt className="font-medium text-ink mb-1">We do not hold every application</dt>
                <dd className="text-ink-muted leading-relaxed">
                  On the best-covered council tested, we held 86% of what it
                  published over a sample week. Roughly half the shortfall was data
                  we had not yet fetched, which closes as coverage expands; the rest
                  never reached our upstream source at all.
                </dd>
              </div>
              <div>
                <dt className="font-medium text-ink mb-1">Some councils publish less often than others</dt>
                <dd className="text-ink-muted leading-relaxed">
                  A council&rsquo;s feed can stall for weeks at the source. Where that
                  happens we show the same gap the source has, and cannot fill it.
                </dd>
              </div>
              <div>
                <dt className="font-medium text-ink mb-1">Coverage is still being built</dt>
                <dd className="text-ink-muted leading-relaxed">
                  {coverage.councilsWithData} of {coverage.councilsKnown} planning
                  authorities currently hold data. The national sweep runs hourly and
                  works through the remainder.
                </dd>
              </div>
              <div>
                <dt className="font-medium text-ink mb-1">The data is not ours</dt>
                <dd className="text-ink-muted leading-relaxed">
                  Every record originates in a local planning authority&rsquo;s public
                  register. We aggregate, score and route it — we do not originate it,
                  and we link every application back to the council&rsquo;s own entry so
                  you can check.
                </dd>
              </div>
            </dl>
          </section>

          {/* ---- method ---- */}
          <section className="mb-14">
            <h2 className="text-lg font-semibold text-ink mb-1">How this is measured</h2>
            <p className="text-sm leading-relaxed text-ink-muted">
              Applications are sampled across councils, capped per council so no
              single busy authority dominates. For each, the council&rsquo;s own
              register entry is retrieved from its planning portal and compared field
              by field. Agreement means the stored value matches the register;
              anything ambiguous is set aside for a person rather than scored in our
              favour. Results are stored against the applications they describe, so
              the audit can be re-run and compared rather than existing as a snapshot.
            </p>
          </section>

          <footer className="border-t border-border pt-5 text-xs text-ink-muted leading-relaxed">
            <p>
              Figures counted from live records, refreshed hourly. Last updated{' '}
              {when(generatedAt)}. Method and underlying results available on request
              — <a href="mailto:william@planningping.com" className="text-primary-500 hover:underline">william@planningping.com</a>.
            </p>
          </footer>

        </div>
      </main>
    </div>
  )
}
