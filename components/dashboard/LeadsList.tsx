'use client'

// Band-filtered list of scored applications, with reasons shown per row.
// Plain and functional — this is the demo surface for prospects, not polished
// production UI. The filter is just links that set ?band= on the URL.

import { useState, useTransition } from 'react'
import { trackOpportunity } from './leadActions'
import type { PlanningApplication } from '@/types/database'

type BandFilter = 'HOT' | 'WARM' | 'COLD' | 'ALL'

const BAND_STYLE: Record<'HOT' | 'WARM' | 'COLD', string> = {
  HOT: 'text-red-700 bg-red-50 border-red-200',
  WARM: 'text-amber-700 bg-amber-50 border-amber-200',
  COLD: 'text-slate-600 bg-slate-50 border-slate-200',
}

const FILTERS: BandFilter[] = ['ALL', 'HOT', 'WARM', 'COLD']

// Approved score disclaimer copy — shown as a caption and as the band tooltip.
const SCORE_DISCLAIMER =
  'Scores are automated estimates of likely relevance only. They are a starting point, not a recommendation — review each application yourself before acting on it.'

export default function LeadsList({
  applications,
  activeBand,
  trackedIds,
  showTrackActions,
}: {
  applications: PlanningApplication[]
  activeBand: BandFilter
  trackedIds: string[]
  showTrackActions: boolean
}) {
  const trackedSet = new Set(trackedIds)

  return (
    <div className="space-y-4">
      {/* Score disclaimer — visible at the point scores are read. */}
      <p className="text-xs leading-relaxed text-[#A0A1A6]">{SCORE_DISCLAIMER}</p>

      {/* Band filter */}
      <div className="flex gap-2">
        {FILTERS.map((f) => {
          const href = f === 'ALL' ? '/leads' : `/leads?band=${f}`
          const active = f === activeBand
          return (
            <a
              key={f}
              href={href}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                active
                  ? 'border-gray-900 bg-gray-900 text-white'
                  : 'border-[#D6E4FB] bg-white text-[#6B6C70] hover:border-[#D6E4FB]'
              }`}
            >
              {f}
            </a>
          )
        })}
      </div>

      {applications.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[#D6E4FB] p-10 text-center">
          <p className="text-sm text-[#6B6C70]">
            No scored applications{activeBand !== 'ALL' ? ` in ${activeBand}` : ''} yet.
            Run <code className="font-mono text-xs">/api/score</code> after the scraper has stored data.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {applications.map((app) => (
            <LeadCard
              key={app.id}
              app={app}
              isTracked={trackedSet.has(app.id)}
              showTrackActions={showTrackActions}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function LeadCard({
  app,
  isTracked,
  showTrackActions,
}: {
  app: PlanningApplication
  isTracked: boolean
  showTrackActions: boolean
}) {
  const band = app.band ?? 'COLD'

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
    <div className="rounded-lg border border-[#D6E4FB] bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <span
              title={SCORE_DISCLAIMER}
              className={`cursor-help rounded border px-2 py-0.5 text-xs font-semibold ${BAND_STYLE[band]}`}
            >
              {band}
            </span>
            <span className="text-xs text-[#A0A1A6]">score {app.score ?? 0}</span>
            <span className="font-mono text-xs text-[#6B6C70]">{app.reference}</span>
            {app.application_date && (
              <span className="text-xs text-[#A0A1A6]">{app.application_date}</span>
            )}
          </div>
          <p className="text-sm text-[#202124]">{app.description ?? 'No description'}</p>
          {app.address && <p className="text-xs text-[#A0A1A6] mt-0.5">{app.address}</p>}
        </div>

        {showTrackActions && (
          <div className="shrink-0">
            {tracked ? (
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
            )}
          </div>
        )}
      </div>

      {/* Why it scored — the demo payload */}
      {app.score_reasons && app.score_reasons.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {app.score_reasons.map((reason, i) => (
            <span
              key={i}
              className="rounded bg-[#F7F7F8] px-2 py-0.5 text-xs text-[#6B6C70]"
            >
              {reason}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
