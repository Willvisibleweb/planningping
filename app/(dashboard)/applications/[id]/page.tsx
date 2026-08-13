// Single planning-application detail page. Didn't exist before this feature
// — applications previously only ever rendered as rows inside lists
// (dashboard, territory page, leads page). Built specifically to host the
// discharge-of-condition sub-list / parent link.
//
// RLS note: planning_applications' select policy has no row-specific
// predicate beyond council membership (via tracked_areas), so a direct
// .eq('id', id).maybeSingle() is filtered exactly like a list query — a
// non-visible row just returns null, same as any other RLS-scoped read.

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { statusStyle } from '@/lib/statusStyle'
import { getProfile } from '@/lib/access'
import { getUserFeatures } from '@/lib/features'
import { ChevronRight } from 'lucide-react'
import Badge from '@/components/ui/Badge'
import SiteMonitoringButton from '@/components/features/SiteMonitoringButton'
import type { PlanningApplication } from '@/types/database'
import Link from 'next/link'

type ChildRow = Pick<PlanningApplication, 'id' | 'reference' | 'status' | 'application_date' | 'is_stale'>
type ParentRow = Pick<PlanningApplication, 'id' | 'reference' | 'address' | 'description'>

function niceDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(`${iso}T00:00:00Z`)
  if (isNaN(d.getTime())) return iso
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

// "in 3 weeks" next to a target date is the bit that prompts action — a raw
// date makes you do the arithmetic. Returns null once a decision has actually
// been issued, since the target is then history, and null for a target that has
// passed without one, because "overdue by 40 days" is normal in planning and
// reads as an error rather than information.
function decisionCountdown(target: string | null, decided: string | null): string | null {
  if (!target || decided) return null
  const days = Math.round(
    (new Date(`${target}T00:00:00Z`).getTime() - Date.now()) / 86_400_000,
  )
  if (isNaN(days) || days < 0) return null
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days < 14) return `in ${days} days`
  if (days < 60) return `in ${Math.round(days / 7)} weeks`
  return null
}

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: appRow } = await supabase.from('planning_applications').select('*').eq('id', id).maybeSingle()
  if (!appRow) notFound()
  const app = appRow as PlanningApplication

  // getProfile is React-cached, so this shares the layout's fetch rather than
  // adding a round trip.
  const profile = await getProfile()
  const features = getUserFeatures(profile)

  const [{ data: children }, parentResult] = await Promise.all([
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
  ])

  const childRows = (children ?? []) as ChildRow[]
  const parent = parentResult.data as ParentRow | null

  const { tone: statusTone, Icon: StatusIcon } = statusStyle(app.status)
  const isDischarge = app.application_type === 'discharge_of_condition'

  return (
    <div className="pp-stagger space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <p className="tabular-data text-sm text-ink-muted">{app.reference}</p>
          {app.application_date && <p className="text-xs text-ink-muted">{niceDate(app.application_date)}</p>}
        </div>
        <h2 className="text-xl font-semibold text-ink">{app.description ?? 'No description'}</h2>
        {app.address && <p className="mt-1 text-sm text-ink-muted">{app.address}</p>}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {app.status ? (
            <Badge tone={statusTone} icon={StatusIcon} className="px-2.5 py-1 text-xs">
              {app.status}
            </Badge>
          ) : (
            <Badge tone="neutral" className="px-2.5 py-1 text-xs">
              Status not available
            </Badge>
          )}
          {isDischarge && (
            <Badge tone="primary" className="px-2.5 py-1 text-xs">
              Discharge of condition
            </Badge>
          )}
          {app.is_stale && (
            <Badge tone="warning" className="px-2.5 py-1 text-xs">
              Stale — no decision yet
            </Badge>
          )}
        </div>

        {/* The two fields that make this a lead rather than a notification:
            who to approach, and how long there is to do it. Both come from
            PlanIt and were being discarded until migration 0021. Rendered only
            when present — a council that withholds the agent shouldn't leave an
            empty row implying we failed to find it. */}
        {(app.agent_company || app.target_decision_date) && (
          <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-3 rounded-md border border-border bg-surface-sunken px-4 py-3">
            {app.agent_company && (
              <div className="min-w-0">
                <dt className="text-2xs font-semibold uppercase tracking-wider text-ink-muted">
                  Submitted by
                </dt>
                <dd className="mt-0.5 truncate text-sm font-medium text-ink" title={app.agent_company}>
                  {app.agent_company}
                </dd>
              </div>
            )}
            {app.target_decision_date && (
              <div>
                <dt className="text-2xs font-semibold uppercase tracking-wider text-ink-muted">
                  Decision due
                </dt>
                <dd className="tabular-data mt-0.5 text-sm font-medium text-ink">
                  {niceDate(app.target_decision_date)}
                  {decisionCountdown(app.target_decision_date, app.decision_date) && (
                    <span className="ml-2 font-sans text-xs font-normal text-ink-muted">
                      {decisionCountdown(app.target_decision_date, app.decision_date)}
                    </span>
                  )}
                </dd>
              </div>
            )}
          </dl>
        )}

        {/* Partner-only. Gated here on the server as well as inside the
            component, so a non-partner never ships the markup at all — not
            hidden with CSS, not rendered and then removed. */}
        {features.siteMonitoring && (
          <div className="mt-4">
            <SiteMonitoringButton app={app} hubId={profile?.partner_hub_id ?? null} />
          </div>
        )}
      </div>

      {isDischarge && (
        <div className="rounded-md border border-border bg-surface p-4 sm:p-5 shadow-sm">
          <h3 className="text-sm font-medium text-ink">Parent application</h3>
          {parent ? (
            <Link
              href={`/applications/${parent.id}`}
              className="pp-lift mt-3 block rounded-sm border border-border p-4 transition-[border-color,box-shadow,transform] duration-fast ease-standard hover:-translate-y-px hover:border-primary-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45 focus-visible:ring-offset-2"
            >
              <p className="tabular-data text-xs text-ink-muted">{parent.reference}</p>
              <p className="mt-1.5 text-sm text-ink">{parent.description ?? 'No description'}</p>
              {parent.address && <p className="mt-1 text-xs text-ink-muted">{parent.address}</p>}
            </Link>
          ) : app.parent_application_reference ? (
            <p className="mt-2 text-sm text-ink-muted">
              Parent application <span className="tabular-data">{app.parent_application_reference}</span> not
              found in our records yet — it may not have been tracked, or hasn&rsquo;t been ingested.
            </p>
          ) : (
            <p className="mt-2 text-sm text-ink-muted">
              The parent application reference could not be automatically identified from this
              application&rsquo;s description.
            </p>
          )}
        </div>
      )}

      {childRows.length > 0 && (
        <div className="rounded-md border border-border bg-surface p-4 sm:p-5 shadow-sm">
          <h3 className="text-sm font-medium text-ink">
            Linked discharge application{childRows.length === 1 ? '' : 's'}
          </h3>
          <div className="mt-2 divide-y divide-border">
            {childRows.map((child) => (
              <Link
                key={child.id}
                href={`/applications/${child.id}`}
                className="group -mx-2 flex items-center justify-between gap-3 rounded-sm px-2 py-3 transition-colors duration-fast ease-standard hover:bg-primary-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45"
              >
                <div className="min-w-0">
                  <p className="tabular-data text-xs text-ink-muted">{child.reference}</p>
                  {child.application_date && (
                    <p className="text-xs text-ink-muted">Submitted {niceDate(child.application_date)}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {child.is_stale && (
                    <span className="rounded-full bg-warning-50 px-2 py-0.5 text-2xs font-medium text-warning-600">
                      Stale
                    </span>
                  )}
                  <span className="text-xs text-ink-muted">{child.status ?? 'Status not available'}</span>
                  {/* The whole row is the link, so it needs something that says
                      so — a hover background alone gives no cue until you're
                      already on it. */}
                  <ChevronRight
                    size={15}
                    aria-hidden="true"
                    className="shrink-0 text-neutral-400 transition-[color,transform] duration-fast ease-standard group-hover:translate-x-0.5 group-hover:text-primary-600"
                  />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
