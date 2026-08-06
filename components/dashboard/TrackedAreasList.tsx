'use client'

import { useState, useTransition } from 'react'
import { MapPin, Inbox, ArrowRight } from 'lucide-react'
import { deleteTrackedArea } from './actions'
import ApplicationRow from './ApplicationRow'
import EmptyState from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import type { TrackedArea, PlanningApplication } from '@/types/database'
import Link from 'next/link'

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
      <div className="rounded-md border border-dashed border-border bg-surface">
        <EmptyState
          icon={MapPin}
          title="No territory tracked yet"
          description="Add a postcode above and PlanningPing starts monitoring every application that authority publishes within your radius. First results usually land within the hour."
        />
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
  const { toast } = useToast()

  function handleDelete() {
    startTransition(async () => {
      // Previously fire-and-forget: the card vanished with no confirmation,
      // and a failure was silent — the row simply stayed put with no
      // explanation.
      const result = await deleteTrackedArea(area.id)
      if (result?.error) {
        toast({
          title: 'Couldn’t remove that territory',
          description: result.error,
          variant: 'error',
        })
        return
      }
      toast({
        title: `${area.label} removed`,
        description: 'We’ve stopped monitoring that area.',
        variant: 'success',
      })
    })
  }

  const visible = showAll ? applications : applications.slice(0, 5)

  return (
    <div className="rounded-md border border-border bg-surface p-5 sm:p-6 shadow-sm">
      {/* Stacks below sm: at 375px the label, the button and Remove can't share
          a row without the council slug being squeezed to nothing. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link
            href={`/dashboard/${area.id}`}
            className="block truncate rounded-sm font-medium text-ink transition-colors duration-fast ease-standard hover:text-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45 focus-visible:ring-offset-2"
          >
            {area.label}
          </Link>
          <p className="mt-1 truncate text-sm text-ink-muted">
            {area.postcode} — {area.council_slug}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {/* A link styled as a button — the Button component renders a
              <button>, and this navigates, so it stays an anchor and borrows
              the secondary variant's look instead. */}
          <Link
            href={`/dashboard/${area.id}`}
            className="pp-lift group inline-flex h-9 items-center gap-1.5 rounded-sm border border-border bg-surface px-3.5 text-sm font-medium text-primary-600 shadow-sm transition-[background-color,border-color,box-shadow,transform] duration-fast ease-standard hover:-translate-y-px hover:border-primary-300 hover:bg-primary-50 hover:shadow-md active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45 focus-visible:ring-offset-2"
          >
            View territory
            <ArrowRight
              size={14}
              className="shrink-0 transition-transform duration-fast ease-standard group-hover:translate-x-0.5"
            />
          </Link>
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
        <EmptyState
          size="sm"
          icon={Inbox}
          title="Nothing here yet"
          description="No applications published in this territory since monitoring began. New ones appear as the council releases them."
        />
      )}
    </div>
  )
}
