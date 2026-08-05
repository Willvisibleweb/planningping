'use client'

import { useState, useTransition } from 'react'
import { MapPin, Inbox, ArrowRight } from 'lucide-react'
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
      <div className="rounded-md border border-dashed border-border">
        <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-full bg-primary-100 text-primary-500">
          <MapPin size={20} />
        </div>
        <p className="text-sm font-medium text-ink">No territory tracked yet</p>
        <p className="mt-1 text-sm text-ink-muted">Add a postcode above and we&rsquo;ll start monitoring that planning authority for you.</p>
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
          applications={filterByBand(appsByCouncil[area.council_slug] ?? [], area.min_band)}
          trackedSet={trackedSet}
          showTrackActions={showTrackActions}
        />
      ))}
    </div>
  )
}

// Applications are fetched per council, but min_band is a per-territory
// preference (two areas can share a council with different filters) — so
// this filters after grouping, not in the page's query. Same knob the alert
// cron reads (app/api/cron/ingest/route.ts) — "what you see" and "what you
// get emailed about" stay in sync.
function filterByBand(apps: PlanningApplication[], minBand: TrackedArea['min_band']): PlanningApplication[] {
  if (minBand === 'ALL') return apps
  if (minBand === 'WARM_PLUS') return apps.filter((a) => a.band === 'HOT' || a.band === 'WARM')
  return apps.filter((a) => a.band === 'HOT') // HOT_ONLY
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
    <div className="rounded-md border border-border bg-surface p-6 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <a
            href={`/dashboard/${area.id}`}
            className="rounded-sm font-medium text-ink transition-colors duration-fast ease-standard hover:text-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45 focus-visible:ring-offset-2"
          >
            {area.label}
          </a>
          <p className="mt-1 text-sm text-ink-muted">
            {area.postcode} — {area.council_slug}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {/* A link styled as a button — the Button component renders a
              <button>, and this navigates, so it stays an anchor and borrows
              the secondary variant's look instead. */}
          <a
            href={`/dashboard/${area.id}`}
            className="pp-lift group inline-flex h-9 items-center gap-1.5 rounded-sm border border-border bg-surface px-3.5 text-sm font-medium text-primary-600 shadow-sm transition-[background-color,border-color,box-shadow,transform] duration-fast ease-standard hover:-translate-y-px hover:border-primary-300 hover:bg-primary-50 hover:shadow-md active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45 focus-visible:ring-offset-2"
          >
            View territory
            <ArrowRight
              size={14}
              className="shrink-0 transition-transform duration-fast ease-standard group-hover:translate-x-0.5"
            />
          </a>
          <button
            onClick={handleDelete}
            disabled={isPending}
            className="rounded-sm text-xs text-ink-muted transition-colors duration-fast ease-standard hover:text-danger-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45 focus-visible:ring-offset-2 disabled:opacity-40"
          >
            {isPending ? 'Removing…' : 'Remove'}
          </button>
        </div>
      </div>

      {applications.length > 0 ? (
        <div className="mt-4 divide-y divide-border">
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
              className="mt-1 w-full rounded-sm py-2.5 text-xs font-medium text-primary-600 transition-colors duration-fast ease-standard hover:bg-primary-50 hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45"
            >
              {showAll
                ? 'Show less'
                : `Show ${applications.length - 5} more application${applications.length - 5 === 1 ? '' : 's'}`}
            </button>
          )}
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-2 text-xs text-ink-muted">
          <Inbox size={14} className="shrink-0" />
          No planning applications found in this territory yet.
        </div>
      )}
    </div>
  )
}
