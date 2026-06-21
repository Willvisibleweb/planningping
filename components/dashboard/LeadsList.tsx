'use client'

// Band-filtered list of scored applications, with reasons shown per row.
// Plain and functional — this is the demo surface for prospects, not polished
// production UI. The filter is just links that set ?band= on the URL.

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
}: {
  applications: PlanningApplication[]
  activeBand: BandFilter
}) {
  return (
    <div className="space-y-4">
      {/* Score disclaimer — visible at the point scores are read. */}
      <p className="text-xs leading-relaxed text-gray-400">{SCORE_DISCLAIMER}</p>

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
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
              }`}
            >
              {f}
            </a>
          )
        })}
      </div>

      {applications.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-10 text-center">
          <p className="text-sm text-gray-500">
            No scored applications{activeBand !== 'ALL' ? ` in ${activeBand}` : ''} yet.
            Run <code className="font-mono text-xs">/api/score</code> after the scraper has stored data.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {applications.map((app) => (
            <LeadCard key={app.id} app={app} />
          ))}
        </div>
      )}
    </div>
  )
}

function LeadCard({ app }: { app: PlanningApplication }) {
  const band = app.band ?? 'COLD'
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <span
              title={SCORE_DISCLAIMER}
              className={`cursor-help rounded border px-2 py-0.5 text-xs font-semibold ${BAND_STYLE[band]}`}
            >
              {band}
            </span>
            <span className="text-xs text-gray-400">score {app.score ?? 0}</span>
            <span className="font-mono text-xs text-gray-500">{app.reference}</span>
            {app.application_date && (
              <span className="text-xs text-gray-400">{app.application_date}</span>
            )}
          </div>
          <p className="text-sm text-gray-900">{app.description ?? 'No description'}</p>
          {app.address && <p className="text-xs text-gray-400 mt-0.5">{app.address}</p>}
        </div>
      </div>

      {/* Why it scored — the demo payload */}
      {app.score_reasons && app.score_reasons.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {app.score_reasons.map((reason, i) => (
            <span
              key={i}
              className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
            >
              {reason}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
