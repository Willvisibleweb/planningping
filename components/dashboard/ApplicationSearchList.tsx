'use client'

// Search/filter box + the full application list for a territory. Lets you
// find an application you spotted pinned on the map (by reference or address)
// without scrolling the whole list by hand. Pure client-side filter over data
// already fetched server-side — no extra query.

import { useMemo, useState } from 'react'
import { Search, SearchX, Inbox } from 'lucide-react'
import ApplicationRow from './ApplicationRow'
import EmptyState from '@/components/ui/EmptyState'
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
    return (
      <EmptyState
        size="sm"
        icon={Inbox}
        title="Nothing here yet"
        description="No applications have been published in this territory since we started monitoring it. New ones appear here as the council releases them."
      />
    )
  }

  return (
    <div>
      <div className="relative mb-4">
        <Search
          size={15}
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search applications in this territory"
          placeholder="Search by reference, address or description…"
          className="w-full rounded-sm border border-border bg-surface py-2 pl-9 pr-3 text-sm text-ink placeholder:text-neutral-500 transition-[border-color,box-shadow] duration-fast ease-standard hover:border-primary-300 focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-500/15"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          size="sm"
          icon={SearchX}
          title={`No matches for “${query}”`}
          description="Search covers the reference, address and description. Try a shorter term or part of a postcode."
        />
      ) : (
        <div className="divide-y divide-border">
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
