'use client'

// Band-filtered list of scored applications, with reasons shown per row.
// The filter is just links that set ?band= on the URL.

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Check, Target, Filter, ArrowRight } from 'lucide-react'
import { trackOpportunity } from './leadActions'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import LinkButton from '@/components/ui/LinkButton'
import { useToast } from '@/components/ui/Toast'
import { BAND_LABEL, BAND_TONE } from './FitScore'
import type { PlanningApplication } from '@/types/database'

type BandFilter = 'HOT' | 'WARM' | 'COLD' | 'ALL'



// Approved score disclaimer copy — shown as a caption and as the band tooltip.
const SCORE_DISCLAIMER =
  'Fit scores are automated estimates of likely commercial relevance. They are a starting point for qualification, not a recommendation — review each opportunity yourself before acting on it.'

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
      <p className="text-xs leading-relaxed text-ink-muted">{SCORE_DISCLAIMER}</p>

      {/* The band pills that used to sit here are gone. FilterBar owns fit now,
          and two controls for one thing is one too many — worse, these were
          plain anchors to /leads?band=X, so choosing a band silently discarded
          every other filter the user had set and reloaded the whole page. */}

      {applications.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-surface">
          {/* This previously read "Run /api/score after the scraper has stored
              data" — an internal instruction shown to paying customers. */}
          {activeBand === 'ALL' ? (
            <EmptyState
              icon={Target}
              title="No scored opportunities yet"
              description="As schemes land in your territories we score them for the work your firm wins — drainage, highways, groundworks, structures — and the strongest appear here."
              action={
                <Link
                  href="/dashboard"
                  className="pp-lift inline-flex h-8 items-center rounded-sm border border-border bg-surface px-3 text-xs font-medium text-ink shadow-sm transition-[background-color,border-color,box-shadow,transform] duration-fast ease-standard hover:-translate-y-px hover:border-primary-300 hover:bg-primary-50 hover:shadow-md active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45 focus-visible:ring-offset-2"
                >
                  Check your territories
                </Link>
              }
            />
          ) : (
            <EmptyState
              size="sm"
              icon={Filter}
              title={`Nothing rated “${BAND_LABEL[activeBand]}” right now`}
              description="Your territories have scored opportunities, just none at this level yet."
              action={
                <Link
                  href="/leads"
                  className="pp-lift inline-flex h-8 items-center rounded-sm border border-border bg-surface px-3 text-xs font-medium text-ink shadow-sm transition-[background-color,border-color,box-shadow,transform] duration-fast ease-standard hover:-translate-y-px hover:border-primary-300 hover:bg-primary-50 hover:shadow-md active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45 focus-visible:ring-offset-2"
                >
                  Show all opportunities
                </Link>
              }
            />
          )}
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
      toast({
        title: 'Couldn’t track that opportunity',
        description: result.error,
        variant: 'error',
      })
    })
  }

  return (
    <div className="rounded-md border border-border bg-surface p-4 sm:p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <Badge
              tone={BAND_TONE[band]}
              title={SCORE_DISCLAIMER}
              className="cursor-help font-semibold"
            >
              {BAND_LABEL[band]}
            </Badge>
            <span className="tabular-data text-xs text-ink-muted">score {app.score ?? 0}</span>
            {/* Plain text — opening is the explicit button in the action row. */}
            <span className="tabular-data text-xs text-ink-muted">{app.reference}</span>
            {app.application_date && (
              <span className="text-xs text-ink-muted">{app.application_date}</span>
            )}
          </div>
          <p className="text-sm text-ink line-clamp-2" title={app.description ?? undefined}>
            {app.description ?? 'No description'}
          </p>
          {app.address && <p className="text-xs text-ink-muted mt-0.5">{app.address}</p>}
        </div>

        {showTrackActions && tracked && (
          <div className="shrink-0">
            <Badge tone="success" icon={Check}>Tracked</Badge>
          </div>
        )}
      </div>

      {/* Why it scored — the demo payload */}
      {app.score_reasons && app.score_reasons.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {app.score_reasons.map((reason, i) => (
            <span
              key={i}
              className="rounded-sm bg-surface-sunken px-2 py-0.5 text-xs text-ink-muted ring-1 ring-inset ring-neutral-200"
            >
              {reason}
            </span>
          ))}
        </div>
      )}

      {/* Explicit action row, matching ApplicationRow. */}
      <div className="mt-3.5 flex flex-wrap items-center gap-2">
        <LinkButton href={`/applications/${app.id}`} size="sm" variant="secondary">
          Open application
          <ArrowRight size={13} className="shrink-0" aria-hidden="true" />
        </LinkButton>

        {showTrackActions && !tracked && (
          <Button
            size="sm"
            variant="ghost"
            onClick={handleTrack}
            loading={isPending}
            loadingLabel="Tracking opportunity"
          >
            Track Opportunity
          </Button>
        )}
      </div>
    </div>
  )
}
