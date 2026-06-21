'use client'

// Kanban-look pipeline board: one column per stage, cards grouped by stage.
// Stage is changed via a per-card <select> (no drag-and-drop — minimal code,
// mobile-friendly). Each card can generate an AI outreach draft.

import { useState, useTransition } from 'react'
import { setStage, untrackLead } from './leadActions'
import OutreachModal from './OutreachModal'
import { PIPELINE_STAGES, type PipelineStage, type TrackedLead } from '@/types/database'

export default function PipelineBoard({ leads }: { leads: TrackedLead[] }) {
  const [outreachLead, setOutreachLead] = useState<TrackedLead | null>(null)

  if (leads.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 p-10 text-center">
        <p className="text-sm text-gray-500">
          No tracked opportunities yet. Hit &ldquo;Track Opportunity&rdquo; on an application
          from your dashboard to add it here.
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
              <h3 className="text-sm font-semibold text-gray-900">{stage}</h3>
              <span className="text-xs text-gray-400">{byStage[stage].length}</span>
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
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="mb-1 flex items-center gap-2">
        <span className="font-mono text-xs text-gray-500">{lead.reference}</span>
        {lead.priority_follow_up && (
          <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
            PRIORITY
          </span>
        )}
      </div>

      <p className="text-sm text-gray-900">{lead.description ?? 'No description'}</p>
      {lead.address && <p className="mt-0.5 text-xs text-gray-400">{lead.address}</p>}
      {lead.cached_status && (
        <p className="mt-1 text-xs text-gray-500">Status: {lead.cached_status}</p>
      )}
      {lead.last_contacted_at && (
        <p className="mt-0.5 text-xs text-gray-400">
          Contacted {new Date(lead.last_contacted_at).toLocaleDateString('en-GB')}
        </p>
      )}

      <div className="mt-3 flex items-center gap-2">
        <select
          value={lead.pipeline_stage}
          onChange={(e) => handleStageChange(e.target.value as PipelineStage)}
          disabled={isPending}
          className="flex-1 rounded border border-gray-200 px-1.5 py-1 text-xs text-gray-700 disabled:opacity-50"
        >
          {PIPELINE_STAGES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <button
          onClick={onOutreach}
          className="rounded border border-[#2563EB] px-2 py-1 text-xs font-medium text-[#2563EB] hover:bg-[#2563EB] hover:text-white transition-colors"
        >
          Outreach
        </button>
      </div>

      <button
        onClick={handleUntrack}
        disabled={isPending}
        className="mt-2 text-[11px] text-gray-400 hover:text-red-600 disabled:opacity-40"
      >
        Remove
      </button>
    </div>
  )
}
