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
import Badge from '@/components/ui/Badge'
import type { PlanningApplication } from '@/types/database'

type ChildRow = Pick<PlanningApplication, 'id' | 'reference' | 'status' | 'application_date' | 'is_stale'>
type ParentRow = Pick<PlanningApplication, 'id' | 'reference' | 'address' | 'description'>

function niceDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(`${iso}T00:00:00Z`)
  if (isNaN(d.getTime())) return iso
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`
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
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <p className="font-mono text-sm text-[#6B6C70]">{app.reference}</p>
          {app.application_date && <p className="text-xs text-[#A0A1A6]">{niceDate(app.application_date)}</p>}
        </div>
        <h2 className="text-xl font-semibold text-[#202124]">{app.description ?? 'No description'}</h2>
        {app.address && <p className="mt-1 text-sm text-[#6B6C70]">{app.address}</p>}

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
      </div>

      {isDischarge && (
        <div className="rounded-lg border border-[#D6E4FB] bg-white p-4">
          <h3 className="text-sm font-medium text-[#202124]">Parent application</h3>
          {parent ? (
            <a
              href={`/applications/${parent.id}`}
              className="pp-lift mt-3 block rounded-sm border border-border p-4 transition-[border-color,box-shadow,transform] duration-fast ease-standard hover:-translate-y-px hover:border-primary-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45 focus-visible:ring-offset-2"
            >
              <p className="tabular-data text-xs text-ink-muted">{parent.reference}</p>
              <p className="mt-1.5 text-sm text-ink">{parent.description ?? 'No description'}</p>
              {parent.address && <p className="mt-1 text-xs text-ink-muted">{parent.address}</p>}
            </a>
          ) : app.parent_application_reference ? (
            <p className="mt-2 text-sm text-[#6B6C70]">
              Parent application <span className="font-mono">{app.parent_application_reference}</span> not
              found in our records yet — it may not have been tracked, or hasn&rsquo;t been ingested.
            </p>
          ) : (
            <p className="mt-2 text-sm text-[#6B6C70]">
              The parent application reference could not be automatically identified from this
              application&rsquo;s description.
            </p>
          )}
        </div>
      )}

      {childRows.length > 0 && (
        <div className="rounded-lg border border-[#D6E4FB] bg-white p-4">
          <h3 className="text-sm font-medium text-[#202124]">
            Linked discharge application{childRows.length === 1 ? '' : 's'}
          </h3>
          <div className="mt-2 divide-y divide-[#E9F0FD]">
            {childRows.map((child) => (
              <a
                key={child.id}
                href={`/applications/${child.id}`}
                className="flex items-center justify-between gap-3 py-2.5 hover:bg-[#F7F9FF]"
              >
                <div className="min-w-0">
                  <p className="font-mono text-xs text-[#6B6C70]">{child.reference}</p>
                  {child.application_date && (
                    <p className="text-xs text-[#A0A1A6]">Submitted {niceDate(child.application_date)}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {child.is_stale && (
                    <span className="rounded-full bg-[#FFFBEB] px-2 py-0.5 text-[11px] font-medium text-[#B45309]">
                      Stale
                    </span>
                  )}
                  <span className="text-xs text-[#6B6C70]">{child.status ?? 'Status not available'}</span>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
