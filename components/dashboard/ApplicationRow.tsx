'use client'

// A single opportunity row: what the scheme is, how well it fits, who submitted
// it, and the two things you can do about it. Shared between the dashboard feed
// and the territory page so both look identical — only the territory page
// passes `distanceKm`.
//
// The fit verdict leads. This row previously showed the council's status badge
// and nothing else on the right, which meant the one field that answers "is
// this worth my time" — the score, already computed for every application —
// was invisible everywhere except the leads page. Council status is planning
// process; fit is the commercial signal, so fit goes first and status sits
// under it as supporting detail.

import { useState, useTransition } from 'react'
import { HelpCircle, Check, ArrowRight } from 'lucide-react'
import { trackOpportunity } from './leadActions'
import { statusStyle } from '@/lib/statusStyle'
import FitScore, { type Band } from './FitScore'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import LinkButton from '@/components/ui/LinkButton'
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
          // Names no stage: they're user-configurable now, and this used to
          // claim "the Identified stage", which stopped existing when the
          // board moved onto pipeline_stages. The server places it at whatever
          // the user's first stage is.
          description: `${app.reference} is in your pipeline at your first stage.`,
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
      className="-mx-3 scroll-mt-4 rounded-sm px-3 py-4 transition-colors duration-fast ease-standard hover:bg-primary-50/60"
    >
      <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-0.5">
          {/* Plain text, not a link. Opening an application is an explicit
              button in the action row below — a reference that only reveals
              itself as a link on hover gave no clue it was clickable, or
              what clicking it would do. */}
          <span className="tabular-data text-xs text-ink-muted">{app.reference}</span>
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
        {/* The consultancy or architect that submitted it — for a civils firm
            this is the route in, since you approach the agent rather than the
            developer. Rendered only when known: PlanIt carries it on roughly
            nine in ten records but capture only began recently, so most older
            rows have nothing, and an empty "Submitted by —" on every one of
            them would read as a broken field rather than a missing one. */}
        {app.agent_company && (
          <p className="mt-1.5 text-xs text-ink-muted">
            Submitted by <span className="font-medium text-ink">{app.agent_company}</span>
          </p>
        )}
      </div>
      {/* Capped rather than shrink-0: status strings from councils run long
          ("Pending consideration"), and an uncapped column pushes the
          description to a one-word ribbon at 375px. */}
      <div className="flex w-24 shrink-0 flex-col items-end gap-1.5 text-right sm:w-auto sm:max-w-[45%]">
        <FitScore score={app.score} band={app.band as Band | null} />
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
        {showTrackActions && tracked && (
          <Badge tone="success" icon={Check}>Tracked</Badge>
        )}
      </div>
      </div>

      {/* Actions get their own row rather than being squeezed into the status
          column. At 375px that column is 96px wide, which is not enough for a
          button whose label actually says what it does. */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <LinkButton href={`/applications/${app.id}`} size="sm" variant="secondary">
          Open opportunity
          <ArrowRight size={13} className="shrink-0" aria-hidden="true" />
        </LinkButton>

        {showTrackActions && !tracked && (
          <Button
            size="sm"
            variant="ghost"
            onClick={handleTrack}
            loading={isPending}
            loadingLabel="Adding to pipeline"
          >
            Add to pipeline
          </Button>
        )}
      </div>
    </div>
  )
}
