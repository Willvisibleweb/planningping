// Dashboard home — shows the user's tracked areas and recent applications.
// All data fetching is server-side. RLS ensures users only see their own data.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getProfile, hasProAccess, hasTopTierAccess } from '@/lib/access'
import { getUserFeatures } from '@/lib/features'
import TrackedAreasList from '@/components/dashboard/TrackedAreasList'
import AddAreaForm from '@/components/dashboard/AddAreaForm'
import PartnerStatusWidget from '@/components/features/PartnerStatusWidget'
import StaleDataNotice from '@/components/dashboard/StaleDataNotice'
import { getIngestFreshness } from '@/lib/health/ingestFreshness'
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

  // Checked here because the dashboard runs whenever someone signs in, and does
  // not depend on the scheduler that is the thing capable of failing.
  const freshness = await getIngestFreshness()

  // A brand-new account has nothing to show here, and an empty state holding a
  // form is a worse first screen than being asked two questions. Sent to setup
  // instead — which redirects straight back if a territory does exist, so the
  // two cannot bounce off each other.
  //
  // Gated on sector being unset as well as having no areas: someone who
  // completed onboarding and later deleted their only territory has already
  // answered these questions, and should get the empty state and the form
  // rather than being walked through setup a second time.
  if ((areas ?? []).length === 0 && !profile?.sector) {
    redirect('/onboarding')
  }

  const councilSlugs = [...new Set((areas ?? []).map((a: TrackedArea) => a.council_slug))]
  const trackedIds = new Set((leads ?? []).map((l) => l.application_id as string))
  // Track Opportunity is a professional feature — homeowners just watch.
  const showTrackActions = hasProAccess(profile)
  // Max-only, matching the territory page and both API routes.
  const canUseAi = hasTopTierAccess(profile)

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
      <StaleDataNotice health={freshness} />

      <div>
        <h2 className="text-xl font-semibold text-ink mb-1">Where to focus</h2>
        <p className="text-sm text-ink-muted">
          Development activity across your territories, scored for the work your
          firm actually wins.
        </p>
      </div>

      {/* Order is the argument. The strong matches come first because that is
          the number a BD manager acts on; the size of the database is context,
          not a result, so it sits last. It previously led with "Applications
          tracked", which answered a question nobody asks. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {showTrackActions && (
          <>
            <StatTile
              label="Strong matches"
              value={hotCount.count ?? 0}
              sub="worth pursuing now"
            />
            <StatTile
              label="In your pipeline"
              value={pipelineCount.count ?? 0}
              sub="opportunities you're working"
            />
          </>
        )}
        <StatTile
          label="Territories"
          value={areas?.length ?? 0}
          sub={`across ${councilCount} planning ${councilCount === 1 ? 'authority' : 'authorities'}`}
        />
        <StatTile
          label="Opportunities in view"
          value={totalApplications ?? 0}
          sub="scored across your territories"
        />
      </div>

      {/* Renders nothing for non-partners — see PartnerStatusWidget. */}
      <PartnerStatusWidget
        features={getUserFeatures(profile)}
        hubId={profile?.partner_hub_id ?? null}
      />

      <AddAreaForm />

      {areasError ? (
        <p className="text-sm text-danger-600">Could not load tracked areas. Please refresh.</p>
      ) : (
        <TrackedAreasList
          areas={areas ?? []}
          applications={applications ?? []}
          trackedIds={[...trackedIds]}
          showTrackActions={showTrackActions}
          canSummarise={canUseAi}
        />
      )}
    </div>
  )
}
