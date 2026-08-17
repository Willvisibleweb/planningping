'use client'

// The lead detail panel: everything known about one opportunity, without
// leaving the board.
//
// Before this, opening a lead meant navigating to /applications/[id] — the
// board unmounted, scroll position was lost, and getting back meant the browser
// back button. Triaging ten leads meant twenty navigations. A slide-over keeps
// the board mounted underneath, so the panel is a look rather than a journey.
//
// It also gives the three things a card has no room for and no page had at all:
// why the score is what it is, what has happened to this lead so far, and
// somewhere to write down what was said on the phone.
//
// Data is fetched on open, not with the board — see getLeadDetail.

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import {
  X,
  Plus,
  ArrowRight,
  Sparkles,
  MessageSquare,
  Mail,
  Phone,
  FileText,
  MoveRight,
  CirclePlus,
} from 'lucide-react'
import { getLeadDetail, addLeadNote, type LeadDetail } from './leadActions'
import ScoreBreakdown from './ScoreBreakdown'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import LinkButton from '@/components/ui/LinkButton'
import Spinner from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import type { LeadEvent, PipelineStageRow, TrackedLead } from '@/types/database'

// One icon per event type so the timeline is scannable without reading every
// line — the shape tells you "note" vs "moved stage" before the words do.
const EVENT_ICON: Record<LeadEvent['type'], typeof MessageSquare> = {
  created: CirclePlus,
  stage_change: MoveRight,
  note: MessageSquare,
  letter_generated: FileText,
  email_logged: Mail,
  call_logged: Phone,
}

const EVENT_LABEL: Record<LeadEvent['type'], string> = {
  created: 'Added to pipeline',
  stage_change: 'Stage changed',
  note: 'Note',
  letter_generated: 'Letter drafted',
  email_logged: 'Outreach sent',
  call_logged: 'Call logged',
}

// "14 Aug, 09:32" — day and time both matter on a timeline, and a bare date
// makes three events on the same day look like one.
function eventTimestamp(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function LeadDetailPanel({
  lead,
  stages,
  onClose,
  onOutreach,
}: {
  lead: TrackedLead
  stages: PipelineStageRow[]
  onClose: () => void
  onOutreach: () => void
}) {
  const [detail, setDetail] = useState<LeadDetail | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [isSaving, startSaving] = useTransition()

  const panelRef = useRef<HTMLDivElement>(null)
  const { toast } = useToast()

  const stage = stages.find((s) => s.id === lead.stage_id)

  const load = useCallback(async () => {
    const result = await getLeadDetail(lead.id)
    if ('error' in result) {
      setLoadError(result.error)
      return
    }
    setDetail(result)
  }, [lead.id])

  useEffect(() => {
    // Every setState inside load() happens after an await, so this cannot
    // cascade renders — same reasoning as OutreachModal's fetch effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see above
    void load()
  }, [load])

  // Held in a ref so the focus effect below can run once per open rather than
  // once per render. The board passes an inline arrow for onClose, so its
  // identity changes on every re-render — as a dependency it would re-run the
  // effect constantly, and each cleanup pass restores focus to the card. Saving
  // a note re-renders the board, so the effect would rip focus out of the panel
  // the moment you used it.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  // Same drawer contract as the mobile nav: Escape closes, focus moves in on
  // open and returns to the card on close, Tab stays inside, page won't scroll
  // behind it.
  useEffect(() => {
    const panel = panelRef.current
    const previouslyFocused = document.activeElement as HTMLElement | null
    panel?.querySelector<HTMLElement>('button, a[href]')?.focus()

    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab' || !panel) return

      const focusables = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, textarea, select, [tabindex]:not([tabindex="-1"])',
      )
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = overflow
      previouslyFocused?.focus()
    }
    // Mount/unmount only, deliberately — see onCloseRef above.
  }, [])

  function handleAddNote() {
    const body = note.trim()
    if (!body) return
    startSaving(async () => {
      const result = await addLeadNote(lead.id, body)
      if (result?.error) {
        toast({ title: 'Couldn’t save that note', description: result.error, variant: 'error' })
        return
      }
      setNote('')
      // Refetch rather than optimistically appending: the server stamps the
      // timestamp and id, and a note that renders differently after reload is
      // worse than one that takes an extra moment to appear.
      await load()
      toast({ title: 'Note saved', variant: 'success' })
    })
  }

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 animate-enter-fade bg-neutral-900/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="lead-panel-heading"
        className="absolute inset-y-0 right-0 flex w-full animate-drawer-right flex-col bg-surface shadow-lg sm:max-w-md"
      >
        {/* Header stays put while the body scrolls — on a long timeline the
            reference is what tells you which lead you're looking at. */}
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 id="lead-panel-heading" className="tabular-data truncate text-sm font-semibold text-ink">
              {lead.reference}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {stage && <Badge tone="primary">{stage.name}</Badge>}
              {lead.priority_follow_up && (
                <Badge tone="danger" className="font-semibold uppercase tracking-wide">
                  Priority
                </Badge>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close lead details"
            className="-m-1 shrink-0 rounded-sm p-1 text-neutral-500 transition-colors duration-fast ease-standard hover:bg-neutral-100 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45"
          >
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <section>
            <p className="text-sm leading-relaxed text-ink">
              {lead.description ?? 'No description'}
            </p>
            {lead.address && (
              <p className="mt-1.5 text-xs text-ink-muted">{lead.address}</p>
            )}
            {lead.cached_status && (
              <p className="mt-3 text-xs text-ink-muted">
                Council status:{' '}
                <span className="font-medium text-ink">{lead.cached_status}</span>
              </p>
            )}
          </section>

          {loadError ? (
            <p className="mt-6 rounded-sm bg-danger-50 px-3 py-2 text-sm text-danger-600">
              {loadError}
            </p>
          ) : !detail ? (
            <div role="status" className="mt-8 flex justify-center py-6 text-ink-muted">
              {/* Spinner is aria-hidden by design, so the status role and this
                  label carry the announcement — otherwise a screen reader gets
                  silence while the panel sits empty. */}
              <Spinner />
              <span className="sr-only">Loading lead details</span>
            </div>
          ) : (
            <>
              <section className="mt-6 border-t border-border pt-5">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-muted">
                  Why this score
                </h3>
                {detail.applicationVisible ? (
                  <ScoreBreakdown
                    score={detail.score}
                    band={detail.band}
                    reasons={detail.reasons}
                    scoreAtAdd={lead.score_at_add}
                  />
                ) : (
                  <div>
                    <p className="tabular-data text-3xl font-semibold text-ink">
                      {lead.score_at_add ?? '—'}
                    </p>
                    <p className="mt-2 text-xs leading-relaxed text-ink-muted">
                      This is the score from when you added the lead. The live
                      figures and the reasons behind them sit with the
                      application, which is only readable while you track{' '}
                      <span className="font-medium text-ink">{lead.council_slug.replace(/-/g, ' ')}</span>.
                      Re-add that area to see the current score.
                    </p>
                  </div>
                )}
              </section>

              <section className="mt-6 border-t border-border pt-5">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-muted">
                  Add a note
                </h3>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  maxLength={2000}
                  placeholder="Spoke to the agent — wants a quote by Friday."
                  className="w-full rounded-sm border border-border-control bg-surface p-3 text-sm text-ink transition-[border-color,box-shadow] duration-fast ease-standard hover:border-primary-300 focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-500/15"
                />
                <div className="mt-2 flex justify-end">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleAddNote}
                    disabled={!note.trim()}
                    loading={isSaving}
                    loadingLabel="Saving note"
                  >
                    <Plus size={13} aria-hidden="true" />
                    Save note
                  </Button>
                </div>
              </section>

              <section className="mt-6 border-t border-border pt-5">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-muted">
                  Activity
                </h3>
                {detail.timeline.length === 0 ? (
                  <p className="rounded-sm border border-dashed border-border-strong px-3 py-5 text-center text-xs leading-relaxed text-ink-muted">
                    Nothing logged yet. Stage changes, outreach and notes all
                    appear here.
                  </p>
                ) : (
                  <ol className="space-y-3">
                    {detail.timeline.map((event) => {
                      const Icon = EVENT_ICON[event.type] ?? MessageSquare
                      return (
                        <li key={event.id} className="flex gap-3">
                          <span
                            aria-hidden="true"
                            className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-ink-muted"
                          >
                            <Icon size={12} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                              <span className="text-xs font-medium text-ink">
                                {EVENT_LABEL[event.type] ?? 'Activity'}
                              </span>
                              <time
                                dateTime={event.created_at}
                                className="tabular-data text-2xs text-ink-muted"
                              >
                                {eventTimestamp(event.created_at)}
                              </time>
                            </div>
                            {event.body && (
                              <p className="mt-0.5 whitespace-pre-wrap break-words text-xs leading-relaxed text-ink-muted">
                                {event.body}
                              </p>
                            )}
                          </div>
                        </li>
                      )
                    })}
                  </ol>
                )}
              </section>
            </>
          )}
        </div>

        <div className="flex gap-2 border-t border-border bg-surface-sunken/60 px-5 py-3">
          <Button size="sm" variant="secondary" onClick={onOutreach} className="flex-1">
            <Sparkles size={13} aria-hidden="true" />
            Draft outreach
          </Button>
          {/* Hidden when the application can't be read — the page behind this
              link is gated by the same policy, so offering it would just send
              the user to a dead end. Shown while detail is still loading:
              flickering the button in after the fetch is worse than briefly
              offering a link that almost always works. */}
          {(!detail || detail.applicationVisible) && (
            <LinkButton
              href={`/applications/${lead.application_id}`}
              size="sm"
              variant="ghost"
              className="flex-1"
            >
              Application
              <ArrowRight size={12} aria-hidden="true" />
            </LinkButton>
          )}
        </div>
      </div>
    </div>
  )
}
