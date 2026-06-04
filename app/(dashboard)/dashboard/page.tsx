// Dashboard home — shows the user's tracked areas and recent applications.
// All data fetching is server-side. RLS ensures users only see their own data.

import { createClient } from '@/lib/supabase/server'
import TrackedAreasList from '@/components/dashboard/TrackedAreasList'
import AddAreaForm from '@/components/dashboard/AddAreaForm'
import type { TrackedArea, PlanningApplication } from '@/types/database'

export default async function DashboardPage() {
  const supabase = await createClient()

  // Fetch the user's tracked areas.
  const { data: areas, error: areasError } = await supabase
    .from('tracked_areas')
    .select('*')
    .order('created_at', { ascending: false })

  // Fetch recent planning applications for all councils the user tracks.
  // We get the unique council slugs first, then fetch applications.
  const councilSlugs = [...new Set((areas ?? []).map((a: TrackedArea) => a.council_slug))]

  const { data: applications } = councilSlugs.length > 0
    ? await supabase
        .from('planning_applications')
        .select('*')
        .in('council_slug', councilSlugs)
        .order('updated_at', { ascending: false })
        .limit(50)
    : { data: [] }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-1">Your tracked areas</h2>
        <p className="text-sm text-gray-500">
          PlanningPing monitors these areas and emails you a weekly digest of new applications and status changes.
        </p>
      </div>

      <AddAreaForm />

      {areasError ? (
        <p className="text-sm text-red-600">Could not load tracked areas. Please refresh.</p>
      ) : (
        <TrackedAreasList
          areas={areas ?? []}
          applications={applications ?? []}
        />
      )}
    </div>
  )
}
