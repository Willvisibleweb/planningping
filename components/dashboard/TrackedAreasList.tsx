'use client'

import { useState, useTransition } from 'react'
import { MapPin, Inbox } from 'lucide-react'
import { deleteTrackedArea } from './actions'
import ApplicationRow from './ApplicationRow'
import type { TrackedArea, PlanningApplication } from '@/types/database'

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
      <div className="rounded-lg border border-dashed border-[#D6E4FB] p-10 text-center">
        <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-full bg-[#EAF0FF] text-[#2563EB]">
          <MapPin size={20} />
        </div>
        <p className="text-sm font-medium text-[#202124]">No territory tracked yet</p>
        <p className="mt-1 text-sm text-[#6B6C70]">Add a postcode above and we&rsquo;ll start monitoring that planning authority for you.</p>
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
    <div className="rounded-lg border border-[#D6E4FB] bg-white p-5 shadow-[0_1px_2px_rgba(32,33,36,.04)]">
      <div className="flex items-start justify-between">
        <div>
          <a href={`/dashboard/${area.id}`} className="font-medium text-[#202124] hover:text-[#2563EB] hover:underline">
            {area.label}
          </a>
          <p className="text-sm text-[#6B6C70] mt-0.5">
            {area.postcode} — {area.council_slug}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <a href={`/dashboard/${area.id}`} className="text-xs font-medium text-[#2563EB] hover:underline">
            View territory &rarr;
          </a>
          <button
            onClick={handleDelete}
            disabled={isPending}
            className="text-xs text-red-500 hover:text-red-700 disabled:opacity-40"
          >
            {isPending ? 'Removing…' : 'Remove'}
          </button>
        </div>
      </div>

      {applications.length > 0 ? (
        <div className="mt-4 divide-y divide-[#E9F0FD]">
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
        <div className="mt-3 flex items-center gap-2 text-xs text-[#A0A1A6]">
          <Inbox size={14} className="shrink-0" />
          No planning applications found in this territory yet.
        </div>
      )}
    </div>
  )
}
