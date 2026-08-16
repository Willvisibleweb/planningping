'use client'

// Kanban board: one lane per stage, cards grouped by stage. Stage is changed
// via a per-card <select> (no drag-and-drop — minimal code, works on touch).
// Each card can generate an AI outreach draft.
//
// Layout note: five lanes never fit the dashboard's max-w-5xl container at a
// usable card width — 1024px across five columns leaves about 148px of content
// per card, which is what pushed the Outreach button out through the card
// border. The board scrolls horizontally at lg and up with fixed-width lanes
// (what every real kanban does), and stacks into full-width sections below
// that, where vertical space is free.

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { KanbanSquare, Trash2, Sparkles, ArrowRight } from 'lucide-react'
import { setStage, untrackLead } from './leadActions'
import OutreachModal from './OutreachModal'
import LeadDetailPanel from './LeadDetailPanel'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import type { PipelineStageRow, TrackedLead } from '@/types/database'

// Tone for a stage's count badge. Derived from the terminal flags rather than
// the name, because names are user-editable now — a firm renaming "Won" to
// "Awarded" should keep the green, and matching on the word would lose it.
// Everything in play reads the same; only the outcomes stand apart.
function stageTone(stage: PipelineStageRow): 'neutral' | 'primary' | 'success' {
  if (stage.is_won) return 'success'
  if (stage.is_lost) return 'neutral'
  return 'primary'
}

export default function PipelineBoard({
  leads,
  stages,
}: {
  leads: TrackedLead[]
  stages: PipelineStageRow[]
}) {
  const [outreachLead, setOutreachLead] = useState<TrackedLead | null>(null)
  const [detailLead, setDetailLead] = useState<TrackedLead | null>(null)

  // Both panels are keyed off the lead id held in state, so a re-render after a
  // stage change or a saved note hands them the fresh row rather than the copy
  // captured when they opened — otherwise the panel would show a stale stage.
  const openDetail = detailLead ? (leads.find((l) => l.id === detailLead.id) ?? null) : null
  const openOutreach = outreachLead ? (leads.find((l) => l.id === outreachLead.id) ?? null) : null

  if (leads.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border bg-surface">
        <EmptyState
          icon={KanbanSquare}
          title="Your pipeline is empty"
          description="Track an opportunity from your territory or leads list and it lands here at your first stage, ready to move through to won."
          action={
            <Link
              href="/leads"
              className="pp-lift inline-flex h-9 items-center rounded-sm bg-primary-500 px-3.5 text-sm font-medium text-white shadow-sm transition-[background-color,box-shadow,transform] duration-fast ease-standard hover:-translate-y-px hover:bg-primary-600 hover:shadow-primary active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45 focus-visible:ring-offset-2"
            >
              Browse your leads
            </Link>
          }
        />
      </div>
    )
  }

  // Group leads by stage id for lane rendering. Order within a lane is the
  // order the page queried them in — priority follow-ups first, then newest.
  const byStage = new Map<string, TrackedLead[]>(stages.map((s) => [s.id, []]))
  // A lead whose stage was deleted would otherwise vanish from the board with
  // no way to recover it. Park those in the entry stage instead of dropping.
  const entryId = stages[0]?.id
  for (const lead of leads) {
    const key = lead.stage_id && byStage.has(lead.stage_id) ? lead.stage_id : entryId
    if (key) byStage.get(key)!.push(lead)
  }

  return (
    <>
      {/* Negative margin lets the scroll area bleed to the viewport edge so a
          half-visible lane reads as "there's more", rather than being clipped
          mid-card against the page gutter. */}
      <div className="-mx-4 overflow-x-auto px-4 pb-3 lg:-mx-8 lg:px-8">
        <div className="flex flex-col gap-6 lg:w-max lg:flex-row lg:gap-4">
          {stages.map((stage) => {
            const stageLeads = byStage.get(stage.id) ?? []
            return (
              <section
                key={stage.id}
                aria-label={`${stage.name} — ${stageLeads.length} ${stageLeads.length === 1 ? 'opportunity' : 'opportunities'}`}
                className="flex flex-col rounded-md bg-surface-sunken p-3 lg:w-[272px] lg:shrink-0"
              >
                <div className="mb-3 flex items-center justify-between gap-2 px-1">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                    {stage.name}
                  </h3>
                  <Badge tone={stageTone(stage)} className="tabular-data">
                    {stageLeads.length}
                  </Badge>
                </div>

                {stageLeads.length === 0 ? (
                  <p className="rounded-sm border border-dashed border-border-strong px-3 py-6 text-center text-2xs leading-relaxed text-ink-muted">
                    Nothing at this stage
                  </p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {stageLeads.map((lead) => (
                      <LeadCard
                        key={lead.id}
                        lead={lead}
                        stages={stages}
                        onOutreach={() => setOutreachLead(lead)}
                        onOpenDetail={() => setDetailLead(lead)}
                      />
                    ))}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      </div>

      {openDetail && (
        <LeadDetailPanel
          lead={openDetail}
          stages={stages}
          onClose={() => setDetailLead(null)}
          // Hand off to the outreach modal, closing the panel behind it: two
          // stacked overlays would leave the focus trap fighting itself.
          onOutreach={() => {
            setDetailLead(null)
            setOutreachLead(openDetail)
          }}
        />
      )}

      {openOutreach && (
        <OutreachModal lead={openOutreach} onClose={() => setOutreachLead(null)} />
      )}
    </>
  )
}

function LeadCard({
  lead,
  stages,
  onOutreach,
  onOpenDetail,
}: {
  lead: TrackedLead
  stages: PipelineStageRow[]
  onOutreach: () => void
  onOpenDetail: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const { toast } = useToast()

  function handleStageChange(stageId: string) {
    const target = stages.find((s) => s.id === stageId)
    startTransition(async () => {
      const result = await setStage(lead.id, stageId)
      if (result?.error) {
        toast({ title: 'Couldn’t move that lead', description: result.error, variant: 'error' })
        return
      }
      toast({
        title: `Moved to ${target?.name ?? 'a new stage'}`,
        description: lead.reference,
        variant: 'success',
      })
    })
  }

  function handleUntrack() {
    startTransition(async () => {
      const result = await untrackLead(lead.id)
      if (result?.error) {
        toast({ title: 'Couldn’t remove that lead', description: result.error, variant: 'error' })
        return
      }
      toast({ title: 'Removed from pipeline', description: lead.reference, variant: 'success' })
    })
  }

  const contactedOn = lead.last_contacted_at
    ? new Date(lead.last_contacted_at).toLocaleDateString('en-GB')
    : null

  return (
    <article className="rounded-md border border-border bg-surface shadow-sm transition-shadow duration-fast ease-standard hover:shadow-md">
      {/* The card body is the click target for the detail panel. It's a button
          rather than a wrapper around the whole <article>, because the footer
          holds its own controls and nesting those inside a button is invalid
          markup that breaks keyboard access to them. */}
      <button
        type="button"
        onClick={onOpenDetail}
        aria-label={`Open details for ${lead.reference}`}
        className="block w-full rounded-t-md p-3.5 text-left transition-colors duration-fast ease-standard hover:bg-surface-sunken/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500/45"
      >
        <div className="flex items-start justify-between gap-2">
          <span className="tabular-data min-w-0 truncate text-xs text-ink-muted">
            {lead.reference}
          </span>
          {lead.priority_follow_up && (
            <Badge tone="danger" className="shrink-0 font-semibold uppercase tracking-wide">
              Priority
            </Badge>
          )}
        </div>

        <p className="mt-1.5 line-clamp-2 text-sm leading-snug text-ink" title={lead.description ?? undefined}>
          {lead.description ?? 'No description'}
        </p>
        {lead.address && (
          <p className="mt-1 line-clamp-1 text-xs text-ink-muted" title={lead.address}>
            {lead.address}
          </p>
        )}

        {(lead.cached_status || contactedOn) && (
          <dl className="mt-3 space-y-1 border-t border-border pt-2.5 text-2xs text-ink-muted">
            {lead.cached_status && (
              <div className="flex items-baseline justify-between gap-2">
                <dt>Status</dt>
                {/* Council statuses run to ~32 chars ("Pending consideration"),
                    which truncates in a lane — title keeps it readable. */}
                <dd className="min-w-0 truncate text-right text-ink" title={lead.cached_status}>
                  {lead.cached_status}
                </dd>
              </div>
            )}
            {contactedOn && (
              <div className="flex items-baseline justify-between gap-2">
                <dt>Contacted</dt>
                <dd className="tabular-data text-right text-ink">{contactedOn}</dd>
              </div>
            )}
          </dl>
        )}
      </button>

      {/* Controls sit in their own footer band, stacked rather than in one row.
          The stage <select> carries an intrinsic min-width from its longest
          option, so side-by-side with a button it could not shrink to fit a
          lane and overflowed the card. min-w-0 plus a full-width row makes
          that impossible regardless of lane width. */}
      <div className="space-y-2 border-t border-border bg-surface-sunken/60 p-3">
        <label className="sr-only" htmlFor={`stage-${lead.id}`}>
          Pipeline stage for {lead.reference}
        </label>
        {/* Value is the stage id, not its name. Names are user-editable, so
            keying off them would break every card the moment someone renamed a
            stage — and the server action validates ids against the user's own
            rows, which a name cannot be checked against safely. */}
        <select
          id={`stage-${lead.id}`}
          value={lead.stage_id ?? stages[0]?.id ?? ''}
          onChange={(e) => handleStageChange(e.target.value)}
          disabled={isPending}
          className="w-full min-w-0 rounded-sm border border-border-control bg-surface px-2 py-1.5 text-xs text-ink transition-[border-color,box-shadow] duration-fast ease-standard hover:border-primary-300 focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-500/15 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {stages.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        {/* Kept alongside the clickable body: a card that only responds to a
            click somewhere in its middle is a feature nobody finds. This spells
            it out. The application page is one step on, linked from the panel —
            the panel now carries more about the lead than that page does. */}
        <Button
          size="sm"
          variant="secondary"
          onClick={onOpenDetail}
          className="h-8 w-full px-2 text-2xs"
        >
          View details
          <ArrowRight size={12} className="shrink-0" aria-hidden="true" />
        </Button>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={onOutreach}
            className="h-8 min-w-0 flex-1 px-2 text-2xs"
          >
            <Sparkles size={12} className="shrink-0" aria-hidden="true" />
            Outreach
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleUntrack}
            loading={isPending}
            loadingLabel="Removing from pipeline"
            aria-label={`Remove ${lead.reference} from pipeline`}
            title="Remove from pipeline"
            className="h-8 shrink-0 px-2 text-ink-muted hover:text-danger-600"
          >
            <Trash2 size={13} aria-hidden="true" />
          </Button>
        </div>
      </div>
    </article>
  )
}
