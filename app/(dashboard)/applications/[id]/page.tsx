// Project Intelligence is the sales-oriented view of one planning record.
// Source facts remain visible and separate from PlanningPing's deterministic
// analysis, so a score or recommendation never masquerades as council data.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  ChevronRight,
  Clock3,
  ExternalLink,
  FileText,
  Lightbulb,
  Mail,
  MapPin,
  Phone,
  Users,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { statusStyle } from '@/lib/statusStyle'
import { getProfile, hasProAccess, hasTopTierAccess } from '@/lib/access'
import { getUserFeatures } from '@/lib/features'
import {
  likelyWorkPackages,
  projectStage,
  projectType,
  tenPointScore,
} from '@/lib/opportunities/intelligence'
import { calculateOpportunityScore } from '@/lib/opportunities/opportunityScore'
import Badge from '@/components/ui/Badge'
import SiteMonitoringButton from '@/components/features/SiteMonitoringButton'
import ScoreBreakdown from '@/components/dashboard/ScoreBreakdown'
import ApplicationSummary from '@/components/dashboard/ApplicationSummary'
import FitScore, { type Band } from '@/components/dashboard/FitScore'
import TrackOpportunityButton from '@/components/dashboard/TrackOpportunityButton'
import OpportunityFeedbackButtons from '@/components/dashboard/OpportunityFeedbackButtons'
import DataConfidence from '@/components/dashboard/DataConfidence'
import { assessDataQuality } from '@/lib/reliability/dataQuality'
import { createAdminClient } from '@/lib/supabase/admin'
import type {
  ApplicationChange,
  OrganisationContact,
  OpportunityFeedback,
  OpportunityProfile,
  PlanningApplication,
  ProjectOrganisationRole,
} from '@/types/database'

type ChildRow = Pick<PlanningApplication, 'id' | 'reference' | 'status' | 'application_date' | 'is_stale'>
type ParentRow = Pick<PlanningApplication, 'id' | 'reference' | 'address' | 'description'>

type ProjectTeamRow = {
  id: string
  role: ProjectOrganisationRole
  source_label: string | null
  source_url: string | null
  source_checked_at: string | null
  organisation: {
    id: string
    name: string
    website: string | null
    office_location: string | null
    telephone: string | null
    public_email: string | null
    company_profile_url: string | null
  } | null
}

type RawProjectTeamRow = Omit<ProjectTeamRow, 'organisation'> & {
  organisation: ProjectTeamRow['organisation'][]
}

const ROLE_LABEL: Record<ProjectOrganisationRole, string> = {
  developer_client: 'Developer / client',
  applicant: 'Applicant',
  landowner: 'Landowner',
  planning_agent: 'Planning agent',
  architect: 'Architect',
  planning_consultant: 'Planning consultant',
  civil_engineer: 'Civil engineer',
  structural_engineer: 'Structural engineer',
  drainage_consultant: 'Drainage consultant',
  transport_consultant: 'Transport consultant',
  landscape_architect: 'Landscape architect',
  main_contractor: 'Main contractor',
  other: 'Other consultant',
}

function niceDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(`${iso}T00:00:00Z`)
  if (isNaN(d.getTime())) return iso
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

function decisionCountdown(target: string | null, decided: string | null): string | null {
  if (!target || decided) return null
  const days = Math.round((new Date(`${target}T00:00:00Z`).getTime() - Date.now()) / 86_400_000)
  if (isNaN(days) || days < 0) return null
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days < 14) return `in ${days} days`
  if (days < 60) return `in ${Math.round(days / 7)} weeks`
  return null
}

function FactLabel() {
  return <p className="text-2xs font-semibold uppercase tracking-wider text-ink-muted">Source data</p>
}

function AnalysisLabel() {
  return <p className="text-2xs font-semibold uppercase tracking-wider text-primary-600">PlanningPing analysis</p>
}

function EvidenceBadge({ kind }: { kind: 'fact' | 'estimate' | 'insight' }) {
  const tone = kind === 'fact' ? 'neutral' : kind === 'estimate' ? 'warning' : 'primary'
  return <Badge tone={tone} className="ml-1.5 align-middle uppercase tracking-wide">{kind}</Badge>
}

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: appRow } = await supabase
    .from('planning_applications')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (!appRow) notFound()
  const app = appRow as PlanningApplication

  const profile = await getProfile()
  const features = getUserFeatures(profile)
  const { data: opportunityProfileRow } = await supabase
    .from('opportunity_profiles')
    .select('*')
    .eq('is_primary', true)
    .maybeSingle()
  const opportunityProfile = opportunityProfileRow as OpportunityProfile | null
  const { data: feedbackRow } = opportunityProfile
    ? await supabase
        .from('opportunity_feedback')
        .select('*')
        .eq('application_id', id)
        .eq('opportunity_profile_id', opportunityProfile.id)
        .maybeSingle()
    : await supabase
        .from('opportunity_feedback')
        .select('*')
        .eq('application_id', id)
        .is('opportunity_profile_id', null)
        .maybeSingle()
  const feedback = feedbackRow as OpportunityFeedback | null

  const [
    { data: children },
    parentResult,
    { data: council },
    { data: trackedLead },
    { data: projectTeamData },
    { data: changesData },
    openDuplicates,
  ] = await Promise.all([
    supabase
      .from('planning_applications')
      .select('id, reference, status, application_date, is_stale')
      .eq('parent_application_id', id)
      .order('application_date', { ascending: false, nullsFirst: false }),
    app.application_type === 'discharge_of_condition' && app.parent_application_id
      ? supabase
          .from('planning_applications')
          .select('id, reference, address, description')
          .eq('id', app.parent_application_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('councils').select('name').eq('slug', app.council_slug).maybeSingle(),
    supabase.from('tracked_leads').select('id').eq('application_id', id).maybeSingle(),
    // Migration 0032 makes this the source of truth. The fallback below keeps
    // the known PlanIt agent visible while the migration is being applied.
    supabase
      .from('project_organisations')
      .select('id, role, source_label, source_url, source_checked_at, organisation:organisations(id, name, website, office_location, telephone, public_email, company_profile_url)')
      .eq('application_id', id),
    // Change history is readable wherever the application is (RLS, 0036).
    // Before the migration the table is absent and this is simply empty.
    supabase
      .from('application_changes')
      .select('*')
      .eq('application_id', id)
      .order('detected_at', { ascending: false })
      .limit(12),
    // A count only, through the service role: duplicate review is internal,
    // but whether this record is under review affects its quality score. The
    // id has already matched a row the caller may see.
    createAdminClient()
      .from('duplicate_candidates')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open')
      .or(`application_id.eq.${app.id},candidate_id.eq.${app.id}`),
  ])

  // Supabase types a nested relation as an array even for this many-to-one
  // join. Normalise it once so the page never relies on positional access.
  const storedTeam = ((projectTeamData ?? []) as unknown as RawProjectTeamRow[])
    .map(({ organisation, ...row }) => ({ ...row, organisation: organisation[0] ?? null }))
  const organisationIds = storedTeam.flatMap((row) => row.organisation ? [row.organisation.id] : [])
  const { data: contactsData } = organisationIds.length > 0
    ? await supabase.from('organisation_contacts').select('*').in('organisation_id', organisationIds)
    : { data: [] }
  const contacts = (contactsData ?? []) as OrganisationContact[]
  const contactsByOrganisation = new Map<string, OrganisationContact[]>()
  for (const contact of contacts) {
    const rows = contactsByOrganisation.get(contact.organisation_id) ?? []
    rows.push(contact)
    contactsByOrganisation.set(contact.organisation_id, rows)
  }

  const projectTeam = storedTeam.length > 0
    ? storedTeam
    : app.agent_company
      ? [{
          id: `agent-${app.id}`,
          role: 'planning_agent' as const,
          source_label: 'PlanIt planning record',
          source_url: typeof app.raw_data?.url === 'string' ? app.raw_data.url : null,
          source_checked_at: app.last_scraped_at,
          organisation: {
            id: '', name: app.agent_company, website: null, office_location: null,
            telephone: null, public_email: null, company_profile_url: null,
          },
        }]
      : []

  const childRows = (children ?? []) as ChildRow[]
  const parent = parentResult.data as ParentRow | null
  const sourceUrl = app.source_url ?? (typeof app.raw_data?.url === 'string' ? app.raw_data.url : null)
  const quality = assessDataQuality({
    reference: app.reference,
    councilName: (council as { name?: string } | null)?.name ?? null,
    address: app.address,
    description: app.description,
    status: app.status,
    application_date: app.application_date,
    decision_date: app.decision_date,
    source_url: sourceUrl,
    source_type: app.source_type ?? (app.raw_data?.source === 'planit' ? 'planit' : 'legacy_scrape'),
    has_location: typeof app.raw_data?.lat === 'number',
    agent_company: app.agent_company,
    last_seen_at: app.last_seen_at ?? app.last_scraped_at,
    open_duplicate_candidates: openDuplicates.error ? 0 : openDuplicates.count ?? 0,
  })
  const changes = (changesData ?? []) as ApplicationChange[]
  const match = calculateOpportunityScore(app, opportunityProfile, feedback)
  const packages = match.likelyWork.length > 0
    ? match.likelyWork.map((item) => ({ label: item.label, matchedSignal: item.detail ?? item.label }))
    : likelyWorkPackages(app.score_reasons)
  const scoreOutOfTen = tenPointScore(app.score)
  const recommendedOrganisation = projectTeam.find((row) => row.role === 'planning_agent')
    ?? projectTeam.find((row) => row.role === 'developer_client')
    ?? null
  const { tone: statusTone, Icon: StatusIcon } = statusStyle(app.status)
  const isDischarge = app.application_type === 'discharge_of_condition'

  return (
    <div className="pp-stagger space-y-6">
      <header className="border-b border-border pb-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-2xs font-semibold uppercase tracking-wider text-primary-600">Project intelligence</p>
            <h1 className="mt-2 max-w-4xl text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
              {app.description ?? 'Planning application with no published description'}
            </h1>
            {app.address && (
              <p className="mt-2 flex items-start gap-1.5 text-sm leading-relaxed text-ink-muted">
                <MapPin size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
                {app.address}
              </p>
            )}
          </div>
          <div className="shrink-0">
            <TrackOpportunityButton
              applicationId={app.id}
              reference={app.reference}
              initiallyTracked={Boolean(trackedLead)}
              canTrack={hasProAccess(profile)}
            />
          </div>
        </div>

        <dl className="mt-6 grid gap-3 border-y border-border py-4 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <dt className="text-2xs font-semibold uppercase tracking-wider text-primary-600">Match score</dt>
            <dd className="mt-1 flex items-baseline gap-2">
              <span className="tabular-data text-2xl font-semibold text-ink">{match.score}</span><span className="text-xs text-ink-muted">/ 100</span>
            </dd>
            <p className="mt-1 text-xs font-medium text-primary-700">{match.label}</p>
          </div>
          <div><dt className="text-2xs font-semibold uppercase tracking-wider text-ink-muted">Planning stage (source)</dt><dd className="mt-1 text-sm font-medium text-ink">{projectStage(app)}</dd></div>
          <div><dt className="text-2xs font-semibold uppercase tracking-wider text-ink-muted">Authority</dt><dd className="mt-1 text-sm font-medium text-ink">{council?.name ?? app.council_slug}</dd></div>
          <div><dt className="text-2xs font-semibold uppercase tracking-wider text-ink-muted">Planning reference</dt><dd className="tabular-data mt-1 text-sm font-medium text-ink">{app.reference}</dd></div>
          <div><dt className="text-2xs font-semibold uppercase tracking-wider text-ink-muted">Submitted</dt><dd className="mt-1 text-sm font-medium text-ink">{app.application_date ? niceDate(app.application_date) : 'Not published'}</dd></div>
        </dl>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <FitScore score={app.score} band={app.band as Band | null} showNumber className="px-2.5 py-1 text-xs" />
          {app.status ? <Badge tone={statusTone} icon={StatusIcon} className="px-2.5 py-1 text-xs">{app.status}</Badge> : <Badge tone="neutral" className="px-2.5 py-1 text-xs">Status not available</Badge>}
          {projectType(app) && <Badge tone="neutral" className="px-2.5 py-1 text-xs">{projectType(app)}</Badge>}
          {isDischarge && <Badge tone="primary" className="px-2.5 py-1 text-xs">Discharge of condition</Badge>}
          {app.is_stale && <Badge tone="warning" className="px-2.5 py-1 text-xs">Stale — no decision yet</Badge>}
        </div>
      </header>

      <section className="rounded-md border border-border bg-surface p-4 shadow-sm sm:p-5">
        <FactLabel />
        <div className="mt-2 flex items-center gap-2"><FileText size={16} className="text-ink-muted" aria-hidden="true" /><h2 className="text-base font-semibold text-ink">Planning record</h2></div>
        <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink">{app.description ?? 'The authority did not publish a description for this record.'}</p>
        <dl className="mt-4 grid gap-3 border-t border-border pt-4 text-sm sm:grid-cols-3">
          <div><dt className="text-2xs font-semibold uppercase tracking-wider text-ink-muted">Current status</dt><dd className="mt-1 text-ink">{app.status ?? 'Not published'}</dd></div>
          <div><dt className="text-2xs font-semibold uppercase tracking-wider text-ink-muted">Decision date</dt><dd className="mt-1 text-ink">{app.decision_date ? niceDate(app.decision_date) : 'Not recorded'}</dd></div>
          <div><dt className="text-2xs font-semibold uppercase tracking-wider text-ink-muted">Decision due</dt><dd className="mt-1 text-ink">{app.target_decision_date ? `${niceDate(app.target_decision_date)}${decisionCountdown(app.target_decision_date, app.decision_date) ? ` (${decisionCountdown(app.target_decision_date, app.decision_date)})` : ''}` : 'Not published'}</dd></div>
        </dl>
        {sourceUrl && <a href={sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="pp-link mt-4 inline-flex items-center gap-1.5 text-xs font-medium">View authority record <ExternalLink size={13} aria-hidden="true" /></a>}
      </section>

      <DataConfidence assessment={quality} sourceUrl={sourceUrl} changes={changes} />

      <section className="rounded-md border border-primary-200 bg-primary-50/55 p-4 shadow-sm sm:p-5">
        <AnalysisLabel />
        <div className="mt-2 flex items-center gap-2"><Lightbulb size={16} className="text-primary-600" aria-hidden="true" /><h2 className="text-base font-semibold text-ink">Why this fits you</h2></div>
        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_0.8fr]">
          <div>
            <p className="text-sm font-semibold text-ink">{match.score}/100 — {match.label}</p>
            <ul className="mt-3 space-y-2">
              {match.factors.map((factor) => (
                <li key={factor.label} className="flex gap-2 text-sm leading-relaxed text-ink-muted">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary-500" aria-hidden="true" />
                  <span>
                    <span className="text-ink">{factor.label}</span>
                    <EvidenceBadge kind={factor.kind} />
                    {factor.detail && <span className="block text-xs">{factor.detail}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-sm border border-primary-200 bg-surface p-3">
            <p className="text-2xs font-semibold uppercase tracking-wider text-primary-600">Opportunity timing</p>
            <p className="mt-2 text-sm font-semibold text-ink">{match.timing.label}</p>
            <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">{match.timing.body}</p>
            <p className="mt-3 text-2xs font-semibold uppercase tracking-wider text-ink-muted">Recommended next step</p>
            <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">{match.recommendedAction}</p>
          </div>
        </div>
        {match.concerns.length > 0 && (
          <div className="mt-4 rounded-sm border border-warning-200 bg-warning-50 px-3 py-2">
            <p className="text-2xs font-semibold uppercase tracking-wider text-warning-600">Qualify before acting</p>
            <ul className="mt-1.5 space-y-1">
              {match.concerns.map((concern) => (
                <li key={concern.label} className="text-xs leading-relaxed text-ink-muted">
                  {concern.label}<EvidenceBadge kind={concern.kind} />
                </li>
              ))}
            </ul>
          </div>
        )}
        {!opportunityProfile && (
          <Link href="/settings#opportunity-profile" className="pp-link mt-4 inline-flex text-xs font-medium">
            Improve your recommendations with a company profile
          </Link>
        )}
        <p className="mt-3 text-2xs leading-relaxed text-ink-muted">This is PlanningPing&rsquo;s interpretation of the source record and scoring signals. It is not a council statement or a confirmed construction scope.</p>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-md border border-border bg-surface p-4 shadow-sm sm:p-5">
          <AnalysisLabel />
          <h2 className="mt-2 text-base font-semibold text-ink">Likely work packages</h2>
          {packages.length > 0 ? (
            <><div className="mt-4 flex flex-wrap gap-2">{packages.map((item) => <span key={item.label} className="rounded-sm border border-primary-200 bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-800">{item.label}</span>)}</div><p className="mt-4 text-xs leading-relaxed text-ink-muted">These packages are inferred from the scoring signals below. Review the authority record and technical documents before treating any as confirmed.</p></>
          ) : <p className="mt-3 text-sm leading-relaxed text-ink-muted">No specific civils package can be inferred reliably from the currently available source description.</p>}
        </section>
        <section className="rounded-md border border-border bg-surface p-4 shadow-sm sm:p-5">
          <AnalysisLabel />
          <div className="mt-2 flex items-center gap-2"><Clock3 size={16} className="text-primary-600" aria-hidden="true" /><h2 className="text-base font-semibold text-ink">Opportunity timing</h2></div>
          <p className="mt-3 text-sm font-medium text-ink">{match.timing.label}</p><p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{match.timing.body}</p>
        </section>
      </div>

      {hasTopTierAccess(profile) && <ApplicationSummary applicationId={app.id} description={app.description} initialSummary={app.ai_summary ?? null} generatedAt={app.ai_summary_at ?? null} model={app.ai_summary_model ?? null} />}

      <section className="rounded-md border border-border bg-surface p-4 shadow-sm sm:p-5">
        <AnalysisLabel />
        <h2 className="mt-2 text-base font-semibold text-ink">Why this scored {scoreOutOfTen ? `${scoreOutOfTen} / 10` : 'as it did'}</h2>
        <p className="mt-1 text-xs leading-relaxed text-ink-muted">The existing relevance engine is shown in full so you can qualify the opportunity rather than take a number on trust.</p>
        <div className="mt-4"><ScoreBreakdown score={app.score} band={app.band as Band | null} reasons={app.score_reasons} /></div>
      </section>

      <section className="rounded-md border border-border bg-surface p-4 shadow-sm sm:p-5">
        <FactLabel />
        <div className="mt-2 flex items-center gap-2"><Users size={16} className="text-ink-muted" aria-hidden="true" /><h2 className="text-base font-semibold text-ink">Project team</h2></div>
        {projectTeam.length > 0 ? (
          <div className="mt-4 divide-y divide-border border-y border-border">
            {projectTeam.map((row) => {
              const organisation = row.organisation
              if (!organisation) return null
              const organisationContacts = organisation.id ? contactsByOrganisation.get(organisation.id) ?? [] : []
              return <div key={row.id} className="py-4 first:pt-3 last:pb-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-2xs font-semibold uppercase tracking-wider text-ink-muted">{ROLE_LABEL[row.role]}</p><p className="mt-1 text-sm font-semibold text-ink">{organisation.name}</p></div>{row.source_url && <a href={row.source_url} target="_blank" rel="noopener noreferrer nofollow" className="pp-link text-xs font-medium">View source</a>}</div>
                {(organisation.website || organisation.office_location || organisation.telephone || organisation.public_email || organisationContacts.length > 0) ? <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-ink-muted">{organisation.website && <a href={organisation.website} target="_blank" rel="noopener noreferrer nofollow" className="pp-link">Website</a>}{organisation.office_location && <span className="inline-flex items-center gap-1"><MapPin size={12} aria-hidden="true" />{organisation.office_location}</span>}{organisation.telephone && <span className="inline-flex items-center gap-1"><Phone size={12} aria-hidden="true" />{organisation.telephone}</span>}{organisation.public_email && <a href={`mailto:${organisation.public_email}`} className="pp-link inline-flex items-center gap-1"><Mail size={12} aria-hidden="true" />{organisation.public_email}</a>}{organisationContacts.map((contact) => <span key={contact.id}>{contact.full_name ?? contact.public_email ?? contact.telephone}{contact.job_title ? `, ${contact.job_title}` : ''}</span>)}</div> : <p className="mt-2 text-xs leading-relaxed text-ink-muted">Known from the planning source only. No public contact details have been verified or added.</p>}
              </div>
            })}
          </div>
        ) : <p className="mt-3 text-sm leading-relaxed text-ink-muted">No organisation has been named in the available source data. We do not infer developers, contractors or consultants from the project description.</p>}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-md border border-border bg-surface p-4 shadow-sm sm:p-5">
          <AnalysisLabel /><h2 className="mt-2 text-base font-semibold text-ink">Recommended first contact</h2>
          {recommendedOrganisation?.organisation ? <><p className="mt-3 text-sm font-semibold text-ink">{ROLE_LABEL[recommendedOrganisation.role]}: {recommendedOrganisation.organisation.name}</p><p className="mt-1.5 text-sm leading-relaxed text-ink-muted">This is the first known organisation on the available project record. No developer or main contractor is currently identified, so research this organisation&rsquo;s project role before making an approach.</p></> : <p className="mt-3 text-sm leading-relaxed text-ink-muted">No known project organisation can be recommended yet. Review the authority record for publicly listed project documents or parties.</p>}
        </section>
        <section className="rounded-md border border-border bg-surface p-4 shadow-sm sm:p-5">
          <AnalysisLabel /><h2 className="mt-2 text-base font-semibold text-ink">Next action</h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-muted">{match.recommendedAction}</p>
          <div className="mt-4 flex flex-wrap items-center gap-2"><TrackOpportunityButton applicationId={app.id} reference={app.reference} initiallyTracked={Boolean(trackedLead)} canTrack={hasProAccess(profile)} />{sourceUrl && <a href={sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-border bg-surface px-3 text-sm font-medium text-ink transition-colors hover:border-primary-300 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45 focus-visible:ring-offset-2">Review source <ExternalLink size={14} aria-hidden="true" /></a>}</div>
        </section>
      </div>

      <section className="rounded-md border border-border bg-surface p-4 shadow-sm sm:p-5">
        <AnalysisLabel />
        <h2 className="mt-2 text-base font-semibold text-ink">Opportunity feedback</h2>
        <p className="mt-1 text-xs leading-relaxed text-ink-muted">
          Your feedback is stored against this company profile and will help tune future recommendations.
        </p>
        <div className="mt-4">
          <OpportunityFeedbackButtons
            applicationId={app.id}
            profileId={opportunityProfile?.id ?? null}
            initialVerdict={feedback?.verdict ?? null}
          />
        </div>
      </section>

      {features.siteMonitoring && <SiteMonitoringButton app={app} hubId={profile?.partner_hub_id ?? null} />}

      {isDischarge && <section className="rounded-md border border-border bg-surface p-4 shadow-sm sm:p-5"><FactLabel /><h2 className="mt-2 text-base font-semibold text-ink">Parent application</h2>{parent ? <Link href={`/applications/${parent.id}`} className="pp-lift mt-3 block rounded-sm border border-border p-4 transition-[border-color,box-shadow,transform] duration-fast ease-standard hover:-translate-y-px hover:border-primary-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45 focus-visible:ring-offset-2"><p className="tabular-data text-xs text-ink-muted">{parent.reference}</p><p className="mt-1.5 text-sm text-ink">{parent.description ?? 'No description'}</p>{parent.address && <p className="mt-1 text-xs text-ink-muted">{parent.address}</p>}</Link> : app.parent_application_reference ? <p className="mt-3 text-sm text-ink-muted">Parent application <span className="tabular-data">{app.parent_application_reference}</span> is not in the accessible records yet.</p> : <p className="mt-3 text-sm text-ink-muted">The parent reference could not be identified from the available description.</p>}</section>}

      {childRows.length > 0 && <section className="rounded-md border border-border bg-surface p-4 shadow-sm sm:p-5"><FactLabel /><h2 className="mt-2 text-base font-semibold text-ink">Linked discharge application{childRows.length === 1 ? '' : 's'}</h2><div className="mt-3 divide-y divide-border">{childRows.map((child) => <Link key={child.id} href={`/applications/${child.id}`} className="group -mx-2 flex items-center justify-between gap-3 rounded-sm px-2 py-3 transition-colors hover:bg-primary-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45"><div className="min-w-0"><p className="tabular-data text-xs text-ink-muted">{child.reference}</p>{child.application_date && <p className="text-xs text-ink-muted">Submitted {niceDate(child.application_date)}</p>}</div><div className="flex shrink-0 items-center gap-2">{child.is_stale && <span className="rounded-full bg-warning-50 px-2 py-0.5 text-2xs font-medium text-warning-600">Stale</span>}<span className="text-xs text-ink-muted">{child.status ?? 'Status not available'}</span><ChevronRight size={15} aria-hidden="true" className="text-neutral-400 transition-transform group-hover:translate-x-0.5" /></div></Link>)}</div></section>}
    </div>
  )
}
