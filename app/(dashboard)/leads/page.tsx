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

  // Councils the user tracks (RLS also enforces this on the apps query).
  const { data: areas } = await supabase
    .from('tracked_areas')
    .select('council_slug')
  const councilSlugs = [...new Set((areas ?? []).map((a) => a.council_slug))]

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

  // Deliberately visible to homeowners as a read-only teaser — tracking these
  // as opportunities (pipeline/outreach) is the professional feature.
  const profile = await getProfile()
  const teaser = !hasProAccess(profile)

  return (
    <div className="space-y-6">
      {teaser && (
        <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          {isProfessional(profile) ? (
            <>
              Your free trial has ended — your leads are saved.{' '}
              <a href="/settings#billing" className="font-medium underline">Upgrade</a>{' '}
              to keep tracking opportunities through your pipeline.
            </>
          ) : (
            <>
              Lead scoring is a professional feature. Switch to a professional account in{' '}
              <a href="/settings" className="font-medium underline">Settings</a>{' '}
              (14-day free trial) to track these as opportunities.
            </>
          )}
        </div>
      )}

      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-1">Civils leads</h2>
        <p className="text-sm text-gray-500">
          Planning applications scored for likely civil-engineering subcontract scope.
          Higher score = stronger signal. Reasons show why each one scored.
        </p>
      </div>

      <LeadsList applications={applications} activeBand={activeBand} />
    </div>
  )
}
