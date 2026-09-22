// Dashboard home — shows the user's tracked areas and recent applications.
// All data fetching is server-side. RLS ensures users only see their own data.

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowRight, Clock3, ExternalLink, Target } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getProfile, hasProAccess, hasTopTierAccess } from '@/lib/access'
import { getUserFeatures } from '@/lib/features'
import { calculateOpportunityScore, type OpportunityScoreResult } from '@/lib/opportunities/opportunityScore'
import TrackedAreasList from '@/components/dashboard/TrackedAreasList'
import PlanPal from '@/components/dashboard/PlanPal'
import AddAreaForm from '@/components/dashboard/AddAreaForm'
import PartnerStatusWidget from '@/components/features/PartnerStatusWidget'
import StaleDataNotice from '@/components/dashboard/StaleDataNotice'
import TrackOpportunityButton from '@/components/dashboard/TrackOpportunityButton'
import OpportunityFeedbackButtons from '@/components/dashboard/OpportunityFeedbackButtons'
import Badge from '@/components/ui/Badge'
import LinkButton from '@/components/ui/LinkButton'
import { getIngestFreshness } from '@/lib/health/ingestFreshness'
import type { OpportunityFeedback, OpportunityProfile, PlanningApplication, TrackedArea } from '@/types/database'

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

function nameForGreeting(profileName: string | null, email: string | undefined): string {
  if (profileName) return profileName
  return email?.split('@')[0] || 'there'
}

function rawSourceUrl(app: PlanningApplication): string | null {
  return typeof app.raw_data?.url === 'string' ? app.raw_data.url : null
}

function evidenceTone(kind: 'fact' | 'estimate' | 'insight'): 'neutral' | 'primary' | 'warning' {
  if (kind === 'fact') return 'neutral'
  if (kind === 'estimate') return 'warning'
  return 'primary'
}

function SectionHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-2xs font-semibold uppercase tracking-wider text-primary-600">{eyebrow}</p>
        <h3 className="mt-1 text-base font-semibold text-ink">{title}</h3>
        {description && (
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-ink-muted">{description}</p>
        )}
      </div>
      {action}
    </div>
  )
}

function DashboardBand({
  children,
  muted = false,
}: {
  children: React.ReactNode
  muted?: boolean
}) {
  return (
    <section className={`rounded-md border border-border/70 px-4 py-5 shadow-sm sm:px-5 sm:py-6 lg:px-6 ${muted ? 'bg-surface-sunken' : 'bg-surface-sunken/70'}`}>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

function OpportunityCard({
  app,
  match,
  profileId,
  feedback,
  tracked,
  canTrack,
}: {
  app: PlanningApplication
  match: OpportunityScoreResult
  profileId: string | null
  feedback: OpportunityFeedback | null
  tracked: boolean
  canTrack: boolean
}) {
  const sourceUrl = rawSourceUrl(app)

  return (
    <article className="rounded-md border border-border bg-surface p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="tabular-data text-lg font-semibold text-ink">{match.score}/100</span>
            <Badge tone={match.score >= 80 ? 'success' : match.score >= 65 ? 'primary' : 'neutral'} className="font-semibold">
              {match.label}
            </Badge>
            <span className="tabular-data text-xs text-ink-muted">{app.reference}</span>
          </div>
          <h3 className="mt-2 line-clamp-2 text-base font-semibold text-ink">
            {app.description ?? 'Planning application with no published description'}
          </h3>
          {app.address && <p className="mt-1 text-xs leading-relaxed text-ink-muted">{app.address}</p>}
        </div>
        <div className="shrink-0">
          <Badge tone={match.timing.code === 'urgent' ? 'danger' : match.timing.code === 'contact_now' ? 'warning' : 'primary'} icon={Clock3}>
            {match.timing.label}
          </Badge>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_0.85fr]">
        <div>
          <p className="text-2xs font-semibold uppercase tracking-wider text-primary-600">Why this fits you</p>
          <ul className="mt-2 space-y-1.5">
            {match.factors.slice(0, 4).map((factor) => (
              <li key={factor.label} className="flex gap-2 text-xs leading-relaxed text-ink-muted">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary-500" aria-hidden="true" />
                <span>
                  <span className="text-ink">{factor.label}</span>
                  <Badge tone={evidenceTone(factor.kind)} className="ml-1.5 align-middle uppercase tracking-wide">
                    {factor.kind}
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-2xs font-semibold uppercase tracking-wider text-ink-muted">Recommended next step</p>
          <p className="mt-2 text-xs leading-relaxed text-ink-muted">{match.recommendedAction}</p>
          {match.concerns.length > 0 && (
            <p className="mt-2 text-2xs leading-relaxed text-ink-muted">
              Watch: {match.concerns[0].label}
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <LinkButton href={`/applications/${app.id}`} size="sm" variant="secondary">
          View opportunity
          <ArrowRight size={13} aria-hidden="true" />
        </LinkButton>
        <TrackOpportunityButton
          applicationId={app.id}
          reference={app.reference}
          initiallyTracked={tracked}
          canTrack={canTrack}
        />
        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="inline-flex h-8 items-center gap-1.5 rounded-sm px-3 text-xs font-medium text-ink-muted transition-colors hover:bg-neutral-100 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45 focus-visible:ring-offset-2"
          >
            Research source
            <ExternalLink size={12} aria-hidden="true" />
          </a>
        )}
        <OpportunityFeedbackButtons
          applicationId={app.id}
          profileId={profileId}
          initialVerdict={feedback?.verdict ?? null}
          compact
        />
      </div>
    </article>
  )
}

export default async function DashboardPage() {
  const supabase = await createClient()

  // These three don't depend on each other — fire them concurrently rather
  // than waterfalling. getProfile() is already deduped for free against the
  // layout's call via React's cache().
  const [{ data: areas, error: areasError }, { data: leads }, { data: opportunityProfile }, profile] = await Promise.all([
    supabase.from('tracked_areas').select('*').order('created_at', { ascending: false }),
    // Which applications is the user already tracking as a lead? Used to show
    // "Tracked ✓" instead of the Track button. RLS scopes this to the user.
    supabase.from('tracked_leads').select('application_id'),
    supabase
      .from('opportunity_profiles')
      .select('*')
      .eq('is_primary', true)
      .maybeSingle(),
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

  // Fetch per-council (in parallel) rather than one combined query with a global
  // limit. A single .in(...).limit(50) lets a busy borough fill every slot and
  // starve quieter councils, so their cards render empty even though rows exist.
  const perCouncil = await Promise.all(
    councilSlugs.map((slug) =>
      supabase
        .from('planning_applications')
        .select('*')
        .eq('council_slug', slug)
        .order('application_date', { ascending: false, nullsFirst: false })
        .limit(30),
    ),
  )
  const applications = perCouncil.flatMap((r) => r.data ?? []) as PlanningApplication[]
  const uniqueApplications = [...new Map(applications.map((app) => [app.id, app])).values()]
  const typedProfile = opportunityProfile as OpportunityProfile | null
  const { data: feedbackRows } = typedProfile
    ? await supabase
        .from('opportunity_feedback')
        .select('*')
        .eq('opportunity_profile_id', typedProfile.id)
    : await supabase
        .from('opportunity_feedback')
        .select('*')
        .is('opportunity_profile_id', null)
  const feedbackByApp = new Map(
    ((feedbackRows ?? []) as OpportunityFeedback[]).map((row) => [row.application_id, row]),
  )
  const scoredOpportunities = uniqueApplications
    .map((app) => ({
      app,
      feedback: feedbackByApp.get(app.id) ?? null,
      match: calculateOpportunityScore(app, typedProfile, feedbackByApp.get(app.id) ?? null),
    }))
    .sort((a, b) => b.match.score - a.match.score)

  const activeOpportunities = scoredOpportunities.filter((item) => item.match.category !== 'dismissed')
  const queue = activeOpportunities.slice(0, 6)
  const pursueCount = activeOpportunities.filter((item) => item.match.score >= 70).length
  const monitorCount = activeOpportunities.filter((item) => item.match.timing.code === 'monitor' || item.match.timing.code === 'build_relationship').length
  const importantUpdates = activeOpportunities.filter((item) => item.app.decision_date || item.app.is_stale).length
  const needAttention = activeOpportunities.filter((item) => item.match.timing.code === 'urgent' || item.match.timing.code === 'contact_now').length

  return (
    <div className="pp-stagger space-y-8">
      <StaleDataNotice health={freshness} />

      <div>
        <p className="text-sm font-medium text-primary-700">Good morning, {nameForGreeting(typedProfile?.name ?? null, profile?.email)}</p>
        <h2 className="mt-1 text-xl font-semibold text-ink">Your opportunities</h2>
        <p className="text-sm text-ink-muted">
          Planning applications are the source data. This queue ranks what looks
          worth your attention, why it fits, and what to do next.
        </p>
      </div>

      {canUseAi && (
        <DashboardBand muted>
          <SectionHeading
            eyebrow="Assistant"
            title="Ask PlanPal"
            description="Use this when you want a quick steer across your territories, pipeline and tender feed."
          />
          <PlanPal />
        </DashboardBand>
      )}

      {!typedProfile && showTrackActions && (
        <Link
          href="/settings#opportunity-profile"
          className="block rounded-md border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-primary-900 transition-colors hover:bg-primary-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45 focus-visible:ring-offset-2"
        >
          <span className="font-semibold">Improve your recommendations</span>
          <span className="mt-1 block text-xs leading-relaxed">
            Add your services, preferred sectors and project size range so match
            scores are specific to your company.
          </span>
        </Link>
      )}

      <DashboardBand>
        <SectionHeading
          eyebrow="Today"
          title="Opportunity summary"
          description="A quick read on what needs action, what can wait, and what changed."
        />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {showTrackActions && (
            <>
              <StatTile
                label="Opportunities to pursue"
                value={pursueCount}
                sub="highest personal matches"
              />
              <StatTile
                label="Need attention"
                value={needAttention}
                sub="contact or check now"
              />
            </>
          )}
          <StatTile
            label="Worth monitoring"
            value={monitorCount}
            sub="promising but early"
          />
          <StatTile
            label="Important updates"
            value={importantUpdates}
            sub="decisions or stale items"
          />
        </div>
      </DashboardBand>

      <DashboardBand>
        <SectionHeading
          eyebrow="Territories"
          title="Add or search a postcode"
          description="Add the patches you want PlanningPing to watch before reviewing the recommended opportunities below."
        />
        <AddAreaForm />
      </DashboardBand>

      <DashboardBand muted>
        <SectionHeading
          eyebrow="For you"
          title="Recommended opportunities"
          description="A prioritised queue from the planning data in your tracked territories."
          action={
            <Link href="/leads" className="pp-link inline-flex items-center gap-1 text-xs font-medium">
              Search all planning data
              <ArrowRight size={13} aria-hidden="true" />
            </Link>
          }
        />
        {queue.length > 0 ? (
          <div className="space-y-3">
            {queue.map(({ app, match, feedback }) => (
              <OpportunityCard
                key={app.id}
                app={app}
                match={match}
                profileId={typedProfile?.id ?? null}
                feedback={feedback}
                tracked={trackedIds.has(app.id)}
                canTrack={showTrackActions}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-border bg-surface p-6 text-center">
            <Target size={22} className="mx-auto text-ink-muted" aria-hidden="true" />
            <p className="mt-2 text-sm font-medium text-ink">No priority opportunities yet</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-muted">
              Add a territory or broaden your filters; PlanningPing will keep the wider
              planning feed available below.
            </p>
          </div>
        )}
      </DashboardBand>

      {/* Renders nothing for non-partners — see PartnerStatusWidget. */}
      <PartnerStatusWidget
        features={getUserFeatures(profile)}
        hubId={profile?.partner_hub_id ?? null}
      />

      <DashboardBand>
        <SectionHeading
          eyebrow="Planning feed"
          title="Your tracked territories"
          description="The full territory-by-territory view stays here for checking coverage, changing focus and opening the wider application list."
        />
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
      </DashboardBand>
    </div>
  )
}
