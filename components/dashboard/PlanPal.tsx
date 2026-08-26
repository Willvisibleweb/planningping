'use client'

// PlanPal — the dashboard assistant.
//
// Where the territory chat answers about one area, this one sees the whole
// account: every tracked territory at once, the pipeline, the territory setup
// and the tender feed. It sits at the top of the dashboard because that breadth
// is only useful before you have picked a territory to look at.
//
// Open by default, unlike the territory panel. Nothing is spent until a
// question is actually asked, and an assistant nobody notices is an assistant
// nobody uses.

import { Sparkles } from 'lucide-react'
import AssistantChat from './AssistantChat'

export default function PlanPal() {
  return (
    <div className="rounded-md border border-border bg-surface p-4 sm:p-5 shadow-sm">
      <h3 className="flex items-center gap-1.5 text-sm font-medium text-ink">
        <Sparkles size={14} className="shrink-0 text-primary-500" aria-hidden="true" />
        PlanPal
      </h3>

      <div className="mt-3">
        <AssistantChat
          endpoint="/api/planpal"
          inputId="planpal-question"
          inputLabel="Ask PlanPal a question"
          placeholder="Ask about your territories, pipeline or a scheme…"
          thinkingLabel="Looking through your territories…"
          suggestions={[
            'How do my territories look overall?',
            'What should I chase this week?',
            'Any groundworks in the last month?',
            'Which territory has the most work?',
            'Any open tenders worth a look?',
          ]}
          intro={
            <p className="text-xs leading-relaxed text-ink-muted">
              Ask anything about the schemes across your territories,
              what&rsquo;s sitting in your pipeline, or the public sector
              tenders we track. PlanPal reads the same data you can see — and
              says so plainly when we don&rsquo;t hold something, rather than
              guessing.
            </p>
          }
          footnote={
            <>
              PlanPal only sees councils you track — ask about somewhere else and
              it will tell you we hold no data for it. Fit scores are automated
              estimates, so check the council record before acting.
            </>
          }
        />
      </div>
    </div>
  )
}
