'use client'

// Kanban-look pipeline board: one column per stage, cards grouped by stage.
// Stage is changed via a per-card <select> (no drag-and-drop — minimal code,
// mobile-friendly). Each card can generate an AI outreach draft.

import { useState, useTransition } from 'react'
import { setStage, untrackLead } from './leadActions'
import OutreachModal from './OutreachModal'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { PIPELINE_STAGES, type PipelineStage, type TrackedLead } from '@/types/database'

export default function PipelineBoard({ leads }: { leads: TrackedLead[] }) {
  const [outreachLead, setOutreachLead] = useState<TrackedLead | null>(null)

  if (leads.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border">
        <p className="text-sm text-ink-muted">
          No tracked opportunities yet. Hit &ldquo;Track Opportunity&rdquo; on an application
          in your territory to add it here.
        </p>
      </div>
    )
  }

  // Group leads by stage for column rendering.
  const byStage: Record<PipelineStage, TrackedLead[]> = {
    Identified: [], Contacted: [], Negotiating: [], Won: [], Lost: [],
  }
  for (const lead of leads) byStage[lead.pipeline_stage].push(lead)

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {PIPELINE_STAGES.map((stage) => (
          <div key={stage} className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-ink">{stage}</h3>
              <span className="text-xs text-ink-muted">{byStage[stage].length}</span>
            </div>
            {byStage[stage].map((lead) => (
              <LeadCard key={lead.id} lead={lead} onOutreach={() => setOutreachLead(lead)} />
            ))}
          </div>
        ))}
      </div>

      {outreachLead && (
        <OutreachModal lead={outreachLead} onClose={() => setOutreachLead(null)} />
      )}
    </>
  )
}

function LeadCard({ lead, onOutreach }: { lead: TrackedLead; onOutreach: () => void }) {
  const [isPending, startTransition] = useTransition()

  function handleStageChange(stage: PipelineStage) {
    startTransition(() => { void setStage(lead.id, stage) })
  }

  function handleUntrack() {
    startTransition(() => { void untrackLead(lead.id) })
  }

  return (
    <div className="rounded-md border border-border bg-surface p-4 shadow-sm">
      <div className="mb-1 flex items-center gap-2">
        <span className="tabular-data text-xs text-ink-muted">{lead.reference}</span>
        {lead.priority_follow_up && (
          <Badge tone="danger" className="font-semibold uppercase tracking-wide">
            Priority
          </Badge>
        )}
      </div>

      <p className="text-sm text-ink line-clamp-2" title={lead.description ?? undefined}>
        {lead.description ?? 'No description'}
      </p>
      {lead.address && <p className="mt-0.5 text-xs text-ink-muted">{lead.address}</p>}
      {lead.cached_status && (
        <p className="mt-1 text-xs text-ink-muted">Status: {lead.cached_status}</p>
      )}
      {lead.last_contacted_at && (
        <p className="mt-0.5 text-xs text-ink-muted">
          Contacted {new Date(lead.last_contacted_at).toLocaleDateString('en-GB')}
        </p>
      )}

      <div className="mt-3 flex items-center gap-2">
        <select
          value={lead.pipeline_stage}
          onChange={(e) => handleStageChange(e.target.value as PipelineStage)}
          disabled={isPending}
          className="flex-1 rounded-sm border border-border bg-surface px-2 py-1.5 text-xs text-ink transition-[border-color,box-shadow] duration-fast ease-standard hover:border-primary-300 focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-500/15 disabled:opacity-50"
        >
          {PIPELINE_STAGES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <Button size="sm" variant="secondary" className="h-7 px-2.5 text-2xs" onClick={onOutreach}>
          Outreach
        </Button>
      </div>

      <button
        onClick={handleUntrack}
        disabled={isPending}
        className="mt-2.5 rounded-sm text-2xs text-ink-muted transition-colors duration-fast ease-standard hover:text-danger-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45 focus-visible:ring-offset-2 disabled:opacity-40"
      >
        Remove
      </button>
    </div>
  )
}
