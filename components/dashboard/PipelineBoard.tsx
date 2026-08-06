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
import { KanbanSquare, Trash2, Sparkles } from 'lucide-react'
import { setStage, untrackLead } from './leadActions'
import OutreachModal from './OutreachModal'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { PIPELINE_STAGES, type PipelineStage, type TrackedLead } from '@/types/database'

// Stage → the tone its count badge carries. Won and Lost are terminal, so they
// read differently from the three active stages rather than looking identical
// to work still in play.
const STAGE_TONE: Record<PipelineStage, 'neutral' | 'primary' | 'warning' | 'success'> = {
  Identified: 'neutral',
  Contacted: 'primary',
  Negotiating: 'warning',
  Won: 'success',
  Lost: 'neutral',
}

export default function PipelineBoard({ leads }: { leads: TrackedLead[] }) {
  const [outreachLead, setOutreachLead] = useState<TrackedLead | null>(null)

  if (leads.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border bg-surface">
        <EmptyState
          icon={KanbanSquare}
          title="Your pipeline is empty"
          description="Track an opportunity from your territory or leads list and it lands here at the Identified stage, ready to move through to Won."
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

  // Group leads by stage for lane rendering. Order within a lane is the order
  // the page queried them in — priority follow-ups first, then newest.
  const byStage: Record<PipelineStage, TrackedLead[]> = {
    Identified: [], Contacted: [], Negotiating: [], Won: [], Lost: [],
  }
  for (const lead of leads) byStage[lead.pipeline_stage].push(lead)

  return (
    <>
      {/* Negative margin lets the scroll area bleed to the viewport edge so a
          half-visible lane reads as "there's more", rather than being clipped
          mid-card against the page gutter. */}
      <div className="-mx-4 overflow-x-auto px-4 pb-3 lg:-mx-8 lg:px-8">
        <div className="flex flex-col gap-6 lg:w-max lg:flex-row lg:gap-4">
          {PIPELINE_STAGES.map((stage) => {
            const stageLeads = byStage[stage]
            return (
              <section
                key={stage}
                aria-label={`${stage} — ${stageLeads.length} ${stageLeads.length === 1 ? 'opportunity' : 'opportunities'}`}
                className="flex flex-col rounded-md bg-surface-sunken p-3 lg:w-[272px] lg:shrink-0"
              >
                <div className="mb-3 flex items-center justify-between gap-2 px-1">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                    {stage}
                  </h3>
                  <Badge tone={STAGE_TONE[stage]} className="tabular-data">
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
                        onOutreach={() => setOutreachLead(lead)}
                      />
                    ))}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      </div>

      {outreachLead && (
        <OutreachModal lead={outreachLead} onClose={() => setOutreachLead(null)} />
      )}
    </>
  )
}

function LeadCard({ lead, onOutreach }: { lead: TrackedLead; onOutreach: () => void }) {
  const [isPending, startTransition] = useTransition()
  const { toast } = useToast()

  function handleStageChange(stage: PipelineStage) {
    startTransition(async () => {
      const result = await setStage(lead.id, stage)
      if (result?.error) {
        toast({ title: 'Couldn’t move that lead', description: result.error, variant: 'error' })
        return
      }
      toast({ title: `Moved to ${stage}`, description: lead.reference, variant: 'success' })
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
      <div className="p-3.5">
        <div className="flex items-start justify-between gap-2">
          <Link
            href={`/applications/${lead.application_id}`}
            className="tabular-data min-w-0 truncate rounded-sm text-xs text-ink-muted transition-colors duration-fast ease-standard hover:text-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45 focus-visible:ring-offset-2"
          >
            {lead.reference}
          </Link>
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
      </div>

      {/* Controls sit in their own footer band, stacked rather than in one row.
          The stage <select> carries an intrinsic min-width from its longest
          option, so side-by-side with a button it could not shrink to fit a
          lane and overflowed the card. min-w-0 plus a full-width row makes
          that impossible regardless of lane width. */}
      <div className="space-y-2 border-t border-border bg-surface-sunken/60 p-3">
        <label className="sr-only" htmlFor={`stage-${lead.id}`}>
          Pipeline stage for {lead.reference}
        </label>
        <select
          id={`stage-${lead.id}`}
          value={lead.pipeline_stage}
          onChange={(e) => handleStageChange(e.target.value as PipelineStage)}
          disabled={isPending}
          className="w-full min-w-0 rounded-sm border border-border-control bg-surface px-2 py-1.5 text-xs text-ink transition-[border-color,box-shadow] duration-fast ease-standard hover:border-primary-300 focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-500/15 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {PIPELINE_STAGES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
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
