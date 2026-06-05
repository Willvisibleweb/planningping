'use client'

import { useTransition } from 'react'
import { deleteTrackedArea } from './actions'
import type { TrackedArea, PlanningApplication } from '@/types/database'

interface Props {
  areas: TrackedArea[]
  applications: PlanningApplication[]
}

export default function TrackedAreasList({ areas, applications }: Props) {
  if (areas.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 p-10 text-center">
        <p className="text-sm text-gray-500">No areas tracked yet. Add one above to get started.</p>
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
        />
      ))}
    </div>
  )
}

function AreaCard({ area, applications }: { area: TrackedArea; applications: PlanningApplication[] }) {
  const [isPending, startTransition] = useTransition()

  function handleDelete() {
    startTransition(() => { void deleteTrackedArea(area.id) })
  }

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
          {applications.slice(0, 5).map((app) => (
            <ApplicationRow key={app.id} app={app} />
          ))}
          {applications.length > 5 && (
            <p className="pt-2 text-xs text-gray-400">
              +{applications.length - 5} more applications
            </p>
          )}
        </div>
      ) : (
        <p className="mt-3 text-xs text-gray-400">
          No applications found for this area yet.
        </p>
      )}
    </div>
  )
}

function ApplicationRow({ app }: { app: PlanningApplication }) {
  const statusColour: Record<string, string> = {
    approved: 'text-green-700 bg-green-50',
    refused: 'text-red-700 bg-red-50',
    pending: 'text-yellow-700 bg-yellow-50',
  }
  const statusKey = (app.status ?? '').toLowerCase()
  const colourClass = Object.keys(statusColour).find((k) => statusKey.includes(k))
  const badgeClass = colourClass ? statusColour[colourClass] : 'text-gray-600 bg-gray-100'

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
      {app.status && (
        <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${badgeClass}`}>
          {app.status}
        </span>
      )}
    </div>
  )
}
