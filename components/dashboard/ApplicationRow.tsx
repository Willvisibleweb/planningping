'use client'

// A single planning-application row: reference, date, description, address,
// status pill (with an honest fallback when a source record has no status),
// and the "Track Opportunity" action. Shared between the dashboard's
// per-territory list and the territory detail page so both look identical —
// only the territory page passes `distanceKm`.

import { useState, useTransition } from 'react'
import { HelpCircle, Check } from 'lucide-react'
import { trackOpportunity } from './leadActions'
import { statusStyle } from '@/lib/statusStyle'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { useToast } from '@/components/ui/Toast'
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
  const { tone: statusTone, Icon: StatusIcon } = statusStyle(app.status)

  // Local optimistic flag so the button flips to "Tracked ✓" without a reload.
  const [tracked, setTracked] = useState(isTracked)
  const [isPending, startTransition] = useTransition()
  const { toast } = useToast()

  function handleTrack() {
    startTransition(async () => {
      const result = await trackOpportunity(app.id)
      // Treat "already tracking" as success too — the row is tracked either way.
      if (!result?.error || result.error.startsWith('Already')) {
        setTracked(true)
        toast({
          title: 'Added to your pipeline',
          description: `${app.reference} is now tracked at the Identified stage.`,
          variant: 'success',
        })
        return
      }
      // Previously this failed silently: the button just went back to its
      // resting state and the user had no idea why nothing happened.
      toast({
        title: 'Couldn’t track that opportunity',
        description: result.error,
        variant: 'error',
      })
    })
  }

  return (
    <div
      id={anchorId}
      // Negative margin + matching padding lets the hover background bleed to
      // the card's edge instead of stopping short inside the divider line.
      className="-mx-3 flex scroll-mt-4 items-start justify-between gap-4 rounded-sm px-3 py-4 transition-colors duration-fast ease-standard hover:bg-primary-50/60"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-0.5">
          <a
            href={`/applications/${app.id}`}
            className="tabular-data rounded-sm text-xs text-ink-muted transition-colors duration-fast ease-standard hover:text-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45 focus-visible:ring-offset-2"
          >
            {app.reference}
          </a>
          {app.application_date && (
            <p className="text-xs text-ink-muted">{app.application_date}</p>
          )}
          {typeof distanceKm === 'number' && (
            <p className="text-xs text-ink-muted">
              {distanceKm < 1 ? `${Math.round(distanceKm * 1000)}m away` : `${distanceKm.toFixed(1)}km away`}
            </p>
          )}
        </div>
        <p className="text-sm text-ink line-clamp-2" title={app.description ?? undefined}>
          {app.description ?? 'No description'}
        </p>
        {app.address && (
          <p className="text-xs text-ink-muted mt-0.5">{app.address}</p>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {app.status ? (
          <Badge tone={statusTone} icon={StatusIcon}>
            {app.status}
          </Badge>
        ) : (
          // Some source records (e.g. certain PlanIt-covered councils) don't
          // carry a status — show that honestly instead of an empty gap, and
          // link out to the council record when we have one (raw_data.url).
          <Badge tone="neutral" icon={HelpCircle}>
            Status not available
          </Badge>
        )}
        {!app.status && typeof app.raw_data?.url === 'string' && (
          <a
            href={app.raw_data.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="pp-link text-2xs font-medium"
          >
            Check council portal &rarr;
          </a>
        )}
        {showTrackActions && (tracked ? (
          <Badge tone="success" icon={Check}>Tracked</Badge>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            onClick={handleTrack}
            loading={isPending}
            loadingLabel="Tracking opportunity"
            className="h-7 px-2.5 text-2xs"
          >
            Track Opportunity
          </Button>
        ))}
      </div>
    </div>
  )
}
