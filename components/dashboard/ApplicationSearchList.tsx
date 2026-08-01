'use client'

// Search/filter box + the full application list for a territory. Lets you
// find an application you spotted pinned on the map (by reference or address)
// without scrolling the whole list by hand. Pure client-side filter over data
// already fetched server-side — no extra query.

import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import ApplicationRow from './ApplicationRow'
import type { PlanningApplication } from '@/types/database'

export interface SearchableApplication {
  app: PlanningApplication
  distanceKm: number | null
  isTracked: boolean
}

export default function ApplicationSearchList({
  items,
  showTrackActions,
}: {
  items: SearchableApplication[]
  showTrackActions: boolean
}) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter(({ app }) =>
      app.reference.toLowerCase().includes(q) ||
      (app.address ?? '').toLowerCase().includes(q) ||
      (app.description ?? '').toLowerCase().includes(q),
    )
  }, [items, query])

  if (items.length === 0) {
    return <p className="text-xs text-gray-400">No planning applications found in this territory yet.</p>
  }

  return (
    <div>
      <div className="relative mb-3">
        <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by reference, address or description…"
          className="w-full rounded-md border border-gray-300 py-1.5 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-xs text-gray-400">No applications match &ldquo;{query}&rdquo;.</p>
      ) : (
        <div className="divide-y divide-gray-100">
          {filtered.map(({ app, distanceKm, isTracked }) => (
            <ApplicationRow
              key={app.id}
              app={app}
              isTracked={isTracked}
              showTrackActions={showTrackActions}
              distanceKm={distanceKm}
              anchorId={`app-${app.id}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
