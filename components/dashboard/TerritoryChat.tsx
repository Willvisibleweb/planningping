'use client'

// Ask questions about one territory.
//
// Deliberately not a floating bubble. A support-widget in the corner signals
// "get help with the software"; this is a research tool for the data on the
// page, so it sits in the page as a panel you can collapse.
//
// Conversation mechanics live in AssistantChat, shared with PlanPal. This file
// owns only the framing: what it is called, what it suggests, and the fact
// that it collapses.

import { useState } from 'react'
import { Sparkles, ChevronDown, ChevronUp } from 'lucide-react'
import AssistantChat from './AssistantChat'

export default function TerritoryChat({
  areaId,
  areaLabel,
}: {
  areaId: string
  areaLabel: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-md border border-border bg-surface shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="territory-chat-body"
        className="flex w-full items-center justify-between gap-3 rounded-md px-4 py-3 text-left transition-colors duration-fast ease-standard hover:bg-primary-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500/45"
      >
        <span className="flex min-w-0 items-center gap-2">
          <Sparkles size={15} className="shrink-0 text-primary-500" aria-hidden="true" />
          <span className="text-sm font-medium text-ink">Ask about {areaLabel}</span>
        </span>
        {open ? (
          <ChevronUp size={16} className="shrink-0 text-ink-muted" aria-hidden="true" />
        ) : (
          <ChevronDown size={16} className="shrink-0 text-ink-muted" aria-hidden="true" />
        )}
      </button>

      {open && (
        <div id="territory-chat-body" className="border-t border-border p-4">
          <AssistantChat
            endpoint="/api/territory-chat"
            extraBody={{ areaId }}
            inputId="territory-question"
            inputLabel={`Ask a question about ${areaLabel}`}
            placeholder="Ask about this territory…"
            thinkingLabel={`Looking through ${areaLabel}…`}
            suggestions={[
              'What drainage work has come up here recently?',
              'Summarise this territory for me',
              'Which applications are the strongest fit?',
              'Anything with groundworks in the last month?',
            ]}
            intro={
              <p className="text-xs leading-relaxed text-ink-muted">
                Ask about the applications in this territory — what&rsquo;s come
                up, which carry your scope, or anything about a specific scheme.
                It reads the same data you can see, and will say so when it
                can&rsquo;t find something.
              </p>
            }
            footnote={
              <>
                Answers come from the applications we hold for this territory.
                Always check the council record before acting on one.
              </>
            }
          />
        </div>
      )}
    </div>
  )
}
