'use client'

// A single planning-application row: reference, date, description, address,
// status pill (with an honest fallback when a source record has no status),
// and the "Track Opportunity" action. Shared between the dashboard's
// per-territory list and the territory detail page so both look identical —
// only the territory page passes `distanceKm`.

import { useState, useTransition } from 'react'
import { HelpCircle } from 'lucide-react'
import { trackOpportunity } from './leadActions'
import { statusStyle } from '@/lib/statusStyle'
import type { PlanningApplication } from '@/types/database'

export default function ApplicationRow({
  app,
  isTracked,
  showTrackActions,
  distanceKm,
  anchorId,
}: {
  app: PlanningApplication
  isTracked: boolean
  showTrackActions: boolean
  distanceKm?: number | null
  // Optional #anchor target for the map's "View full details" link to scroll
  // to (see globals.css :target rule). Deliberately opt-in, not derived from
  // app.id automatically: the dashboard can render the same application under
  // more than one area card when two territories share a council, which would
  // create duplicate DOM ids. Only the territory page (one flat, deduped list
  // per page) passes this.
  anchorId?: string
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
    <div id={anchorId} className="py-3 flex items-start justify-between gap-3 scroll-mt-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-xs font-mono text-[#6B7280]">{app.reference}</p>
          {app.application_date && (
            <p className="text-xs text-[#9CA3AF]">{app.application_date}</p>
          )}
          {typeof distanceKm === 'number' && (
            <p className="text-xs text-[#9CA3AF]">
              {distanceKm < 1 ? `${Math.round(distanceKm * 1000)}m away` : `${distanceKm.toFixed(1)}km away`}
            </p>
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
