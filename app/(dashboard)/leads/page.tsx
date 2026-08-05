// Civils leads view (prototype, for demoing to prospects).
// Lists scored applications for the councils the user tracks, filterable by
// band, showing the matchedReasons so a director sees the reasoning.
//
// Server-side fetch; RLS still applies (user only sees councils they track).
// Isolated route — delete this folder to remove the feature.

import { createClient } from '@/lib/supabase/server'
import { getProfile, isProfessional, hasProAccess } from '@/lib/access'
import LeadsList from '@/components/dashboard/LeadsList'
import type { PlanningApplication } from '@/types/database'
import Link from 'next/link'
import { PRICING } from '@/lib/stripe'

type BandFilter = 'HOT' | 'WARM' | 'COLD' | 'ALL'

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ band?: string }>
}) {
  const supabase = await createClient()
  const { band } = await searchParams
  const activeBand: BandFilter =
    band === 'HOT' || band === 'WARM' || band === 'COLD' ? band : 'ALL'

  // These three don't depend on each other — fire them concurrently rather
  // than waterfalling. getProfile() is already deduped for free against the
  // layout's call via React's cache(), but the two table queries were
  // previously serialized needlessly.
  const [{ data: areas }, { data: leads }, profile] = await Promise.all([
    supabase.from('tracked_areas').select('council_slug'),
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
  if (councilSlugs.length > 0) {
    let query = supabase
      .from('planning_applications')
      .select('*')
      .in('council_slug', councilSlugs)
      .not('band', 'is', null)
      .order('score', { ascending: false })
      .limit(100)
    if (activeBand !== 'ALL') query = query.eq('band', activeBand)

    const { data } = await query
    applications = data ?? []
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
        <h2 className="text-xl font-semibold text-ink mb-1">Leads</h2>
        <p className="text-sm text-ink-muted">
          Planning applications scored for likely subcontract scope — drainage, highways,
          flood risk, SuDS, groundworks/geotechnical and structural work. Higher score means
          a stronger signal; reasons show why each one scored.
        </p>
      </div>

      <LeadsList
        applications={applications}
        activeBand={activeBand}
        trackedIds={trackedIds}
        showTrackActions={showTrackActions}
      />
    </div>
  )
}
