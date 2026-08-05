// Coverage — which planning authorities PlanningPing actually has data for
// right now. Real, queried numbers only: council name, application count, and
// a link to the public page for that council when one exists (>=5 applications,
// see migration 0008's seo_locations view) — never a link that would 404.

import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

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
        <div className="rounded-md border border-border bg-surface p-5 shadow-sm">
          <p className="text-2xs font-semibold uppercase tracking-wider text-ink-muted">Authorities</p>
          <p className="mt-1.5 text-2xl font-bold tabular-nums text-ink">{rows.length}</p>
        </div>
        <div className="rounded-md border border-border bg-surface p-5 shadow-sm">
          <p className="text-2xs font-semibold uppercase tracking-wider text-ink-muted">Applications</p>
          <p className="mt-1.5 text-2xl font-bold tabular-nums text-ink">{totalApplications.toLocaleString()}</p>
        </div>
      </div>

      <div className="rounded-md border border-border bg-surface shadow-sm overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_auto] gap-4 border-b border-border bg-surface-sunken px-5 py-2.5 text-2xs font-semibold uppercase tracking-wider text-ink-muted">
          <span>Planning authority</span>
          <span className="text-right">Applications</span>
          <span className="text-right">Public page</span>
        </div>
        <div className="divide-y divide-border">
          {rows.map((r) => (
            <div key={r.slug} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 px-5 py-3 transition-colors duration-fast ease-standard hover:bg-primary-50/60">
              <span className="text-sm text-ink">{r.name}</span>
              <span className="text-right text-sm tabular-nums text-ink-muted">{r.applicationCount.toLocaleString()}</span>
              <span className="text-right">
                {r.hasPublicPage ? (
                  <Link href={`/planning-applications/${r.slug}`} className="text-xs font-medium text-primary-500 hover:underline">
                    View &rarr;
                  </Link>
                ) : (
                  <span className="text-xs text-ink-muted">&mdash;</span>
                )}
              </span>
            </div>
          ))}
          {rows.length === 0 && (
            <p className="px-5 py-6 text-sm text-ink-muted">No coverage data yet.</p>
          )}
        </div>
      </div>
    </div>
  )
}
