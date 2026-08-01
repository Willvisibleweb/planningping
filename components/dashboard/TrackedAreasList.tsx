'use client'

import { useState, useTransition } from 'react'
import { CheckCircle2, XCircle, Clock, CircleDot, MapPin, Inbox, HelpCircle } from 'lucide-react'
import { deleteTrackedArea } from './actions'
import { trackOpportunity } from './leadActions'
import type { TrackedArea, PlanningApplication } from '@/types/database'

// Status → colour + icon, matching the digest email and landing page. Keyword
// matching keeps it robust across councils' wording ("Approved", "Granted",
// "Refused", "Pending consideration", "Awaiting decision", etc.).
function statusStyle(status: string | null) {
  const s = (status ?? '').toLowerCase()
  if (/approv|grant|permit/.test(s)) return { cls: 'bg-[#ECFDF5] text-[#047857]', Icon: CheckCircle2 }
  if (/refus|reject|withdraw|dismiss/.test(s)) return { cls: 'bg-[#FEF2F2] text-[#B91C1C]', Icon: XCircle }
  if (/pending|await|consult|valid|registered/.test(s)) return { cls: 'bg-[#FFFBEB] text-[#B45309]', Icon: Clock }
  return { cls: 'bg-gray-100 text-gray-600', Icon: CircleDot }
}

interface Props {
  areas: TrackedArea[]
  applications: PlanningApplication[]
  trackedIds: string[]
  // False for homeowners / lapsed trials: hides Track buttons + badges.
  // Cosmetic only — trackOpportunity re-checks access server-side.
  showTrackActions: boolean
}

export default function TrackedAreasList({ areas, applications, trackedIds, showTrackActions }: Props) {
  const trackedSet = new Set(trackedIds)

  if (areas.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 p-10 text-center">
        <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-full bg-[#EFF4FF] text-[#2563EB]">
          <MapPin size={20} />
        </div>
        <p className="text-sm font-medium text-gray-900">No areas tracked yet</p>
        <p className="mt-1 text-sm text-gray-500">Add a postcode above and we&rsquo;ll start watching that council for you.</p>
      </div>
    )
  }

  // Group applications by council slug for display alongside each area.
  const appsByCouncil: Record<string, PlanningApplication[]> = {}
  for (const app of applications) {
    if (!appsByCouncil[app.council_slug]) appsByCouncil[app.council_slug] = []
    appsByCouncil[app.council_slug].push(app)
  }

  return (
    <div className="space-y-4">
      {areas.map((area) => (
        <AreaCard
          key={area.id}
          area={area}
          applications={appsByCouncil[area.council_slug] ?? []}
          trackedSet={trackedSet}
          showTrackActions={showTrackActions}
        />
      ))}
    </div>
  )
}

function AreaCard({
  area,
  applications,
  trackedSet,
  showTrackActions,
}: {
  area: TrackedArea
  applications: PlanningApplication[]
  trackedSet: Set<string>
  showTrackActions: boolean
}) {
  const [isPending, startTransition] = useTransition()
  const [showAll, setShowAll] = useState(false)

  function handleDelete() {
    startTransition(() => { void deleteTrackedArea(area.id) })
  }

  const visible = showAll ? applications : applications.slice(0, 5)

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-medium text-gray-900">{area.label}</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            {area.postcode} — {area.council_slug}
          </p>
        </div>
        <button
          onClick={handleDelete}
          disabled={isPending}
          className="text-xs text-red-500 hover:text-red-700 disabled:opacity-40"
        >
          {isPending ? 'Removing…' : 'Remove'}
        </button>
      </div>

      {applications.length > 0 ? (
        <div className="mt-4 divide-y divide-gray-100">
          {visible.map((app) => (
            <ApplicationRow
              key={app.id}
              app={app}
              isTracked={trackedSet.has(app.id)}
              showTrackActions={showTrackActions}
            />
          ))}
          {applications.length > 5 && (
            <button
              onClick={() => setShowAll((v) => !v)}
              className="pt-2 text-xs font-medium text-[#2563EB] hover:underline"
            >
              {showAll
                ? 'Show less'
                : `Show ${applications.length - 5} more application${applications.length - 5 === 1 ? '' : 's'}`}
            </button>
          )}
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-2 text-xs text-gray-400">
          <Inbox size={14} className="shrink-0" />
          No applications found for this area yet.
        </div>
      )}
    </div>
  )
}

function ApplicationRow({
  app,
  isTracked,
  showTrackActions,
}: {
  app: PlanningApplication
  isTracked: boolean
  showTrackActions: boolean
}) {
  const { cls: badgeClass, Icon: StatusIcon } = statusStyle(app.status)

  // Local optimistic flag so the button flips to "Tracked ✓" without a reload.
  const [tracked, setTracked] = useState(isTracked)
  const [isPending, startTransition] = useTransition()

  function handleTrack() {
    startTransition(async () => {
      const result = await trackOpportunity(app.id)
      // Treat "already tracking" as success too — the row is tracked either way.
      if (!result?.error || result.error.startsWith('Already')) setTracked(true)
    })
  }

  return (
    <div className="py-3 flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-xs font-mono text-[#6B7280]">{app.reference}</p>
          {app.application_date && (
            <p className="text-xs text-[#9CA3AF]">{app.application_date}</p>
          )}
        </div>
        <p className="text-sm text-[#111827]">{app.description ?? 'No description'}</p>
        {app.address && (
          <p className="text-xs text-[#9CA3AF] mt-0.5">{app.address}</p>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {app.status ? (
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${badgeClass}`}>
            <StatusIcon size={12} className="shrink-0" />
            {app.status}
          </span>
        ) : (
          // Some source records (e.g. certain PlanIt-covered councils) don't
          // carry a status — show that honestly instead of an empty gap, and
          // link out to the council record when we have one (raw_data.url).
          <span className="inline-flex items-center gap-1 rounded-full bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-400">
            <HelpCircle size={12} className="shrink-0" />
            Status not available
          </span>
        )}
        {!app.status && typeof app.raw_data?.url === 'string' && (
          <a
            href={app.raw_data.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-[11px] font-medium text-[#2563EB] hover:underline"
          >
            Check council portal &rarr;
          </a>
        )}
        {showTrackActions && (tracked ? (
          <span className="rounded border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
            Tracked ✓
          </span>
        ) : (
          <button
            onClick={handleTrack}
            disabled={isPending}
            className="rounded border border-[#2563EB] px-2 py-0.5 text-xs font-medium text-[#2563EB] hover:bg-[#2563EB] hover:text-white transition-colors disabled:opacity-40"
          >
            {isPending ? 'Tracking…' : 'Track Opportunity'}
          </button>
        ))}
      </div>
    </div>
  )
}
