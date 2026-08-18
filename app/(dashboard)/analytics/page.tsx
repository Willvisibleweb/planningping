// Territory analytics.
//
// Answers "where is the work and what kind is it" — the questions a BD manager
// sets territory and staffing from. It does not answer "what is our win rate",
// and says why rather than showing an empty chart.

import { getTerritoryStats } from '@/lib/analytics/territoryStats'
import { getProfile, hasProAccess } from '@/lib/access'
import BarList from './BarList'
import ProGate from '@/components/dashboard/ProGate'
import { isProfessional } from '@/lib/access'

function Panel({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-border bg-surface p-4 sm:p-5 shadow-sm">
      <h3 className="text-sm font-medium text-ink">{title}</h3>
      {hint && <p className="mt-0.5 mb-3 text-2xs leading-relaxed text-ink-muted">{hint}</p>}
      <div className={hint ? '' : 'mt-3'}>{children}</div>
    </section>
  )
}

function niceDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(`${iso}T00:00:00Z`)
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]}`
}

export default async function AnalyticsPage() {
  const profile = await getProfile()
  if (!isProfessional(profile)) return <ProGate variant="homeowner" />
  if (!hasProAccess(profile)) return <ProGate variant="expired" />

  const stats = await getTerritoryStats()

  if (stats.totalApplications === 0) {
    return (
      <div className="pp-stagger space-y-6">
        <div>
          <h2 className="mb-1 text-xl font-semibold text-ink">Analytics</h2>
          <p className="text-sm text-ink-muted">
            Nothing to measure yet. Add a territory and this fills in as
            applications arrive.
          </p>
        </div>
      </div>
    )
  }

  // Only the most recent weeks: a chart of every week since the beginning
  // becomes unreadable long before it becomes more useful.
  const weeks = stats.byWeek.slice(-12)

  return (
    <div className="pp-stagger space-y-6">
      <div>
        <h2 className="mb-1 text-xl font-semibold text-ink">Analytics</h2>
        <p className="text-sm text-ink-muted">
          {stats.totalApplications.toLocaleString()} applications across your
          territories, {niceDate(stats.earliest)} to {niceDate(stats.latest)}.
          {' '}
          {stats.scored.toLocaleString()} have been scored.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Volume by week"
          hint="Applications published per week, most recent last. A quiet week shows as a trough rather than disappearing."
        >
          <BarList
            items={weeks.map((w) => ({ label: `w/c ${niceDate(w.label)}`, count: w.count }))}
            emptyMessage="No dated applications yet."
          />
        </Panel>

        <Panel
          title="Fit mix"
          hint="How your territories break down by commercial relevance."
        >
          <BarList items={stats.byFit} total={stats.totalApplications} emptyMessage="Nothing scored yet." />
        </Panel>

        <Panel
          title="Scope in your patch"
          hint="Which disciplines the scorer is finding. An application can carry more than one, so these do not sum to the total."
        >
          <BarList
            items={stats.byScope}
            emptyMessage="No scope keywords matched yet. This fills in as more applications are scored."
          />
        </Panel>

        <Panel
          title="By authority"
          hint="Where the volume is coming from — useful when deciding whether a territory earns its place."
        >
          <BarList items={stats.byAuthority} total={stats.totalApplications} emptyMessage="No authorities yet." />
        </Panel>

        <Panel title="Application type" hint="PlanIt's own classification of each application.">
          <BarList items={stats.byType} total={stats.totalApplications} emptyMessage="No types recorded." />
        </Panel>

        {/* Said out loud rather than quietly omitted. A missing chart looks like
            an oversight; an explained one sets the expectation for when it
            appears — and stops anyone assuming the numbers exist elsewhere. */}
        <Panel title="Not shown yet" hint="Two reports this page deliberately does not fake.">
          <dl className="space-y-3 text-xs leading-relaxed text-ink-muted">
            <div>
              <dt className="font-medium text-ink">Approval rates</dt>
              <dd className="mt-0.5">
                Only {stats.withDecision} of {stats.totalApplications.toLocaleString()} applications
                carry a decision — councils publish outcomes slowly and unevenly.
                A rate built on that is noise with a percentage sign on it.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-ink">Win rate</dt>
              <dd className="mt-0.5">
                No opportunity has reached a won or lost stage yet. Your pipeline
                already records this, so it appears on its own once you have
                worked a few through.
              </dd>
            </div>
          </dl>
        </Panel>
      </div>
    </div>
  )
}
