// Dashboard home — shows the user's tracked areas and recent applications.
// All data fetching is server-side. RLS ensures users only see their own data.

import { createClient } from '@/lib/supabase/server'
import { getProfile, hasProAccess } from '@/lib/access'
import TrackedAreasList from '@/components/dashboard/TrackedAreasList'
import AddAreaForm from '@/components/dashboard/AddAreaForm'
import type { TrackedArea } from '@/types/database'

function StatTile({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <div className="rounded-md border border-border bg-surface p-4 sm:p-5 shadow-sm">
      <p className="text-2xs font-semibold uppercase tracking-wider text-ink-muted">{label}</p>
      {/* Mono + tabular so figures line up across the four tiles rather than
          jittering as the digit widths change. */}
      <p className="tabular-data mt-2 text-2xl font-semibold text-ink">{value.toLocaleString()}</p>
      <p className="mt-1 text-2xs leading-relaxed text-ink-muted">{sub}</p>
    </div>
  )
}

export default async function DashboardPage() {
  const supabase = await createClient()

  // These three don't depend on each other — fire them concurrently rather
  // than waterfalling. getProfile() is already deduped for free against the
  // layout's call via React's cache().
  const [{ data: areas, error: areasError }, { data: leads }, profile] = await Promise.all([
    supabase.from('tracked_areas').select('*').order('created_at', { ascending: false }),
    // Which applications is the user already tracking as a lead? Used to show
    // "Tracked ✓" instead of the Track button. RLS scopes this to the user.
    supabase.from('tracked_leads').select('application_id'),
    getProfile(),
  ])

  const councilSlugs = [...new Set((areas ?? []).map((a: TrackedArea) => a.council_slug))]
  const trackedIds = new Set((leads ?? []).map((l) => l.application_id as string))
  // Track Opportunity is a professional feature — homeowners just watch.
  const showTrackActions = hasProAccess(profile)

  // Both of these only depend on the batch above (councilSlugs/showTrackActions),
  // not on each other — run them concurrently too.
  const [perCouncil, [{ count: totalApplications }, hotCount, pipelineCount]] = await Promise.all([
    // Fetch per-council (in parallel) rather than one combined query with a global
    // limit. A single .in(...).limit(50) lets a busy borough (e.g. Southwark, 100+)
    // fill every slot and starve quieter councils, so their cards render empty even
    // though rows exist. A per-council cap guarantees each tracked area shows its
    // own recent applications. nullsFirst:false keeps undated rows from sorting on top.
    Promise.all(
      councilSlugs.map((slug) =>
        supabase
          .from('planning_applications')
          .select('*')
          .eq('council_slug', slug)
          .order('application_date', { ascending: false, nullsFirst: false })
          .limit(30),
      ),
    ),
    // Stat strip — a real accurate count (not the per-council-capped list above),
    // plus HOT-lead and pipeline counts for professional accounts.
    Promise.all([
      councilSlugs.length > 0
        ? supabase.from('planning_applications').select('*', { count: 'exact', head: true }).in('council_slug', councilSlugs)
        : Promise.resolve({ count: 0 }),
      showTrackActions && councilSlugs.length > 0
        ? supabase.from('planning_applications').select('*', { count: 'exact', head: true }).in('council_slug', councilSlugs).eq('band', 'HOT')
        : Promise.resolve({ count: null }),
      showTrackActions
        ? supabase.from('tracked_leads').select('*', { count: 'exact', head: true })
        : Promise.resolve({ count: null }),
    ]),
  ])
  const applications = perCouncil.flatMap((r) => r.data ?? [])

  const councilCount = councilSlugs.length

  return (
    <div className="pp-stagger space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-ink mb-1">Your territory</h2>
        <p className="text-sm text-ink-muted">
          PlanningPing monitors these areas and keeps your dashboard current as new applications land.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label="Territories"
          value={areas?.length ?? 0}
          sub={`across ${councilCount} planning ${councilCount === 1 ? 'authority' : 'authorities'}`}
        />
        <StatTile
          label="Applications tracked"
          value={totalApplications ?? 0}
          sub="in your tracked territory"
        />
        {showTrackActions && (
          <>
            <StatTile label="HOT leads" value={hotCount.count ?? 0} sub="civils subcontract scope" />
            <StatTile label="In your pipeline" value={pipelineCount.count ?? 0} sub="tracked opportunities" />
          </>
        )}
      </div>

      <AddAreaForm />

      {areasError ? (
        <p className="text-sm text-danger-600">Could not load tracked areas. Please refresh.</p>
      ) : (
        <TrackedAreasList
          areas={areas ?? []}
          applications={applications ?? []}
          trackedIds={[...trackedIds]}
          showTrackActions={showTrackActions}
        />
      )}
    </div>
  )
}
