// Civils leads view (prototype, for demoing to prospects).
// Lists scored applications for the councils the user tracks, filterable by
// band, showing the matchedReasons so a director sees the reasoning.
//
// Server-side fetch; RLS still applies (user only sees councils they track).
// Isolated route — delete this folder to remove the feature.

import { createClient } from '@/lib/supabase/server'
import { getProfile, isProfessional, hasProAccess } from '@/lib/access'
import LeadsList from '@/components/dashboard/LeadsList'
import FilterBar from '@/components/dashboard/FilterBar'
import { parseFilters, applyFilters } from '@/lib/filters/opportunityFilters'
import type { PlanningApplication } from '@/types/database'
import Link from 'next/link'
import { PRICING } from '@/lib/stripe'

type BandFilter = 'HOT' | 'WARM' | 'COLD' | 'ALL'

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const supabase = await createClient()
  const filters = parseFilters(await searchParams)
  // LeadsList still owns the band pills it has always had, and takes the older
  // 'ALL' shape. Kept in step with the filter object rather than duplicated, so
  // the pills and the panel cannot disagree about what is selected.
  const activeBand: BandFilter = filters.band ?? 'ALL'

  // These three don't depend on each other — fire them concurrently rather
  // than waterfalling. getProfile() is already deduped for free against the
  // layout's call via React's cache(), but the two table queries were
  // previously serialized needlessly.
  const [{ data: areas }, { data: leads }, profile] = await Promise.all([
    supabase.from('tracked_areas').select('council_slug').eq('is_active', true),
    supabase.from('tracked_leads').select('application_id'),
    getProfile(),
  ])
  const councilSlugs = [...new Set((areas ?? []).map((a) => a.council_slug))]
  const trackedIds = (leads ?? []).map((l) => l.application_id as string)

  // Deliberately visible to homeowners as a read-only teaser — tracking these
  // as opportunities (pipeline/outreach) is the professional feature.
  const showTrackActions = hasProAccess(profile)
  const teaser = !showTrackActions

  // Depends on councilSlugs above, so this one has to run after.
  let applications: PlanningApplication[] = []
  let councils: { slug: string; name: string }[] = []
  let contactsAvailable = 0

  if (councilSlugs.length > 0) {
    // Filtering happens in the database, not after the limit. Applying it in
    // the browser over a capped list would mean "Drainage" quietly searching
    // the top 100 by score rather than the territory.
    const query = applyFilters(
      supabase
        .from('planning_applications')
        .select('*')
        .in('council_slug', councilSlugs)
        .not('band', 'is', null)
        .order('score', { ascending: false })
        .limit(100),
      filters,
    )

    const [{ data }, { data: councilRows }, { count: withAgent }] = await Promise.all([
      query,
      supabase.from('councils').select('slug, name').in('slug', councilSlugs),
      // Counted rather than assumed: the agent filter is hidden when nothing in
      // scope carries one, which today is most accounts.
      supabase
        .from('planning_applications')
        .select('*', { count: 'exact', head: true })
        .in('council_slug', councilSlugs)
        .not('agent_company', 'is', null),
    ])
    applications = data ?? []
    councils = (councilRows ?? []) as { slug: string; name: string }[]
    contactsAvailable = withAgent ?? 0
  }

  return (
    <div className="pp-stagger space-y-6">
      {teaser && (
        <div className="rounded-md border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-primary-900">
          {isProfessional(profile) ? (
            <>
              Your free trial has ended — your leads are saved.{' '}
              <Link href="/settings#billing" className="font-medium underline">Upgrade</Link>{' '}
              to keep tracking opportunities through your pipeline.
            </>
          ) : (
            <>
              Lead scoring is a professional feature. Switch to a professional account in{' '}
              <Link href="/settings" className="font-medium underline">Settings</Link>{' '}
              ({PRICING.trialDays}-day free trial) to track these as opportunities.
            </>
          )}
        </div>
      )}

      <div>
        <h2 className="text-xl font-semibold text-ink mb-1">Opportunities</h2>
        <p className="text-sm text-ink-muted">
          Every scheme in your territories, scored for the work your firm wins —
          drainage, highways, flood risk, SuDS, groundworks, geotechnical and
          structural. Each one shows why it scored, so you can qualify it rather
          than take our word for it.
        </p>
      </div>

      <FilterBar
        filters={filters}
        councils={councils}
        resultCount={applications.length}
        contactsAvailable={contactsAvailable}
      />

      <LeadsList
        applications={applications}
        activeBand={activeBand}
        trackedIds={trackedIds}
        showTrackActions={showTrackActions}
      />
    </div>
  )
}
