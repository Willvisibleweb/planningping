'use client'

// Search/filter box + the application list for a territory.
//
// Empty box: the list the page already fetched, nearest first. Typing: a
// server-side full-text search across every application in the territory, not
// just the 200 the page loaded — see searchTerritory for why that distinction
// matters. Search terms are widened with planning vocabulary, so "houses" finds
// descriptions that say "dwellings".

import { useEffect, useRef, useState } from 'react'
import { Search, SearchX, Inbox } from 'lucide-react'
import ApplicationRow from './ApplicationRow'
import { searchTerritory, type SearchableApplication } from './searchActions'
import EmptyState from '@/components/ui/EmptyState'
import Spinner from '@/components/ui/Spinner'

export type { SearchableApplication }

// Long enough that typing a word doesn't fire a query per keystroke, short
// enough that the list feels like it's keeping up.
const DEBOUNCE_MS = 250

export default function ApplicationSearchList({
  areaId,
  items,
  showTrackActions,
  canSummarise,
}: {
  areaId: string
  items: SearchableApplication[]
  showTrackActions: boolean
  canSummarise: boolean
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchableApplication[] | null>(null)
  const [truncated, setTruncated] = useState(false)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Guards against a slow early query landing after a faster later one and
  // overwriting it — the classic out-of-order search bug, where deleting a
  // character leaves you looking at results for a word you no longer typed.
  const requestId = useRef(0)

  // State that reacts to typing is set here rather than in the effect below.
  // Doing it in the effect means a synchronous setState during render commit —
  // a second render pass for every keystroke, and what the lint rule is for.
  function handleQueryChange(next: string) {
    setQuery(next)
    if (next.trim()) {
      setSearching(true)
    } else {
      // Clearing the box drops straight back to the page's own list. Bumping
      // the request id abandons any search still in flight, so a late response
      // can't repopulate a box the user just emptied.
      requestId.current++
      setResults(null)
      setError(null)
      setSearching(false)
    }
  }

  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) return

    const id = ++requestId.current
    const timer = setTimeout(async () => {
      const result = await searchTerritory(areaId, trimmed)
      if (id !== requestId.current) return // superseded
      if ('error' in result) {
        setError(result.error)
        setResults([])
      } else {
        setError(null)
        setResults(result.items)
        setTruncated(result.truncated)
      }
      setSearching(false)
    }, DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [query, areaId])

  const shown = results ?? items
  const isSearch = query.trim().length > 0

  if (items.length === 0 && !isSearch) {
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
      <div className="relative mb-3">
        <Search
          size={15}
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          aria-label="Search applications in this territory"
          placeholder="Search this territory — try “houses”, “drainage”, a street or a reference"
          className="w-full rounded-sm border border-border-control bg-surface py-2 pl-9 pr-9 text-sm text-ink placeholder:text-neutral-500 transition-[border-color,box-shadow] duration-fast ease-standard hover:border-primary-300 focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-500/15"
        />
        {searching && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500">
            <Spinner size={14} />
          </span>
        )}
      </div>

      {/* Result count doubles as the explanation that search isn't limited to
          what's on screen — the previous box searched the loaded page only and
          never said so. aria-live so it's announced, not just seen. */}
      <p aria-live="polite" className="mb-4 min-h-4 text-xs text-ink-muted">
        {isSearch && !searching && !error && (
          <>
            {shown.length === 0
              ? 'No matches across this territory'
              : `${shown.length} ${shown.length === 1 ? 'match' : 'matches'} across the whole territory`}
            {truncated && ' — showing the closest 300'}
          </>
        )}
      </p>

      {error ? (
        <p className="rounded-sm bg-danger-50 px-3 py-2 text-sm text-danger-600">{error}</p>
      ) : shown.length === 0 && isSearch && !searching ? (
        <EmptyState
          size="sm"
          icon={SearchX}
          title={`No matches for “${query}”`}
          description="Search covers the description, address and reference of every application in this territory. Try a single word, or part of a street name."
        />
      ) : (
        <div className="divide-y divide-border">
          {shown.map(({ app, distanceKm, isTracked }) => (
            <ApplicationRow
              key={app.id}
              app={app}
              isTracked={isTracked}
              showTrackActions={showTrackActions}
              canSummarise={canSummarise}
              distanceKm={distanceKm}
              anchorId={`app-${app.id}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
