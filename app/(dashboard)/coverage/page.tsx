// Coverage — which planning authorities PlanningPing actually has data for
// right now. Real, queried numbers only: council name, application count, and
// a link to the public page for that council when one exists (>=5 applications,
// see migration 0008's seo_locations view) — never a link that would 404.

import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Map as MapIcon } from 'lucide-react'
import EmptyState from '@/components/ui/EmptyState'

interface CouncilCoverage {
  slug: string
  name: string
  applicationCount: number
  hasPublicPage: boolean
}

export default async function CoveragePage() {
  const supabase = await createClient()

  const [{ data: councils }, { data: counts }, { data: seoLocations }] = await Promise.all([
    supabase.from('councils').select('slug, name').eq('supported', true).order('name'),
    supabase.from('planning_applications').select('council_slug'),
    supabase.from('seo_locations').select('slug').eq('tier', 'council'),
  ])

  const countBySlug = new Map<string, number>()
  for (const row of (counts ?? []) as { council_slug: string }[]) {
    countBySlug.set(row.council_slug, (countBySlug.get(row.council_slug) ?? 0) + 1)
  }
  const publicSlugs = new Set(((seoLocations ?? []) as { slug: string }[]).map((r) => r.slug))

  const rows: CouncilCoverage[] = ((councils ?? []) as { slug: string; name: string }[])
    .map((c) => ({
      slug: c.slug,
      name: c.name,
      applicationCount: countBySlug.get(c.slug) ?? 0,
      hasPublicPage: publicSlugs.has(c.slug),
    }))
    .sort((a, b) => b.applicationCount - a.applicationCount)

  const totalApplications = rows.reduce((sum, r) => sum + r.applicationCount, 0)

  return (
    <div className="pp-stagger space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-ink mb-1">Coverage</h2>
        <p className="text-sm text-ink-muted max-w-2xl">
          PlanningPing pulls from PlanIt, a national aggregator covering roughly 420 UK planning
          authorities. Track any postcode and we identify the right authority automatically —
          this list shows what we&rsquo;ve actually collected data for so far.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 max-w-lg">
        <div className="rounded-md border border-border bg-surface p-4 sm:p-5 shadow-sm">
          <p className="text-2xs font-semibold uppercase tracking-wider text-ink-muted">Authorities</p>
          <p className="tabular-data mt-2 text-2xl font-semibold text-ink">{rows.length}</p>
        </div>
        <div className="rounded-md border border-border bg-surface p-4 sm:p-5 shadow-sm">
          <p className="text-2xs font-semibold uppercase tracking-wider text-ink-muted">Applications</p>
          <p className="tabular-data mt-2 text-2xl font-semibold text-ink">{totalApplications.toLocaleString()}</p>
        </div>
      </div>

      <div className="rounded-md border border-border bg-surface shadow-sm overflow-hidden">
        {/* The "Public page" column is dropped below sm rather than crushed —
            at 375px three columns leave the authority name about 90px, which
            truncates most council names to nothing useful. */}
        <div className="grid grid-cols-[1fr_auto] gap-4 border-b border-border bg-surface-sunken px-4 py-2.5 text-2xs font-semibold uppercase tracking-wider text-ink-muted sm:grid-cols-[1fr_auto_auto] sm:px-5">
          <span>Planning authority</span>
          <span className="text-right">Applications</span>
          <span className="hidden text-right sm:block">Public page</span>
        </div>
        <div className="divide-y divide-border">
          {rows.map((r) => (
            <div
              key={r.slug}
              className="grid grid-cols-[1fr_auto] items-center gap-4 px-4 py-3 transition-colors duration-fast ease-standard hover:bg-primary-50/60 sm:grid-cols-[1fr_auto_auto] sm:px-5"
            >
              <span className="min-w-0 truncate text-sm text-ink" title={r.name}>
                {r.hasPublicPage ? (
                  // On mobile the name itself carries the link, since the
                  // dedicated column is hidden.
                  <Link
                    href={`/planning-applications/${r.slug}`}
                    className="rounded-sm transition-colors duration-fast ease-standard hover:text-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45 sm:pointer-events-none sm:hover:text-ink"
                  >
                    {r.name}
                  </Link>
                ) : (
                  r.name
                )}
              </span>
              <span className="tabular-data text-right text-sm text-ink-muted">
                {r.applicationCount.toLocaleString()}
              </span>
              <span className="hidden text-right sm:block">
                {r.hasPublicPage ? (
                  <Link
                    href={`/planning-applications/${r.slug}`}
                    className="pp-link text-xs font-medium"
                  >
                    View &rarr;
                  </Link>
                ) : (
                  <span className="text-xs text-ink-muted">&mdash;</span>
                )}
              </span>
            </div>
          ))}
          {rows.length === 0 && (
            <EmptyState
              size="sm"
              icon={MapIcon}
              title="No coverage data yet"
              description="Council coverage appears here once the first scrape completes."
            />
          )}
        </div>
      </div>
    </div>
  )
}
