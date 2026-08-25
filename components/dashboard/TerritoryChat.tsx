'use client'

// Ask questions about one territory.
//
// Deliberately not a floating bubble. A support-widget in the corner signals
// "get help with the software"; this is a research tool for the data on the
// page, so it sits in the page as a panel you can collapse.
//
// The suggested questions are not decoration — a blank chat box is the hardest
// thing to start using, and these teach the shape of what it can answer in one
// click.

import { useEffect, useRef, useState } from 'react'
import { Sparkles, Send, ChevronDown, ChevronUp } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'

interface Turn {
  role: 'user' | 'assistant'
  content: string
}

const SUGGESTIONS = [
  'What drainage work has come up here recently?',
  'Summarise this territory for me',
  'Which applications are the strongest fit?',
  'Anything with groundworks in the last month?',
]

// The model reaches for **bold** when it lists references, and it genuinely
// helps readability — but rendering the raw string shows the asterisks. This
// handles that one construct and leaves everything else as plain text.
// Deliberately not a markdown library: React elements are built here rather
// than HTML injected, so nothing in a model reply can become markup.
function formatReply(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
      <strong key={i} className="font-semibold">
        {part.slice(2, -2)}
      </strong>
    ) : (
      part
    ),
  )
}

export default function TerritoryChat({
  areaId,
  areaLabel,
}: {
  areaId: string
  areaLabel: string
}) {
  const [open, setOpen] = useState(false)
  const [turns, setTurns] = useState<Turn[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const { toast } = useToast()
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Keep the newest turn in view as the conversation grows.
  useEffect(() => {
    if (turns.length > 0) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [turns])

  async function ask(question: string) {
    const q = question.trim()
    if (!q || busy) return

    const next: Turn[] = [...turns, { role: 'user', content: q }]
    setTurns(next)
    setInput('')
    setBusy(true)

    try {
      const res = await fetch('/api/territory-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ areaId, messages: next }),
      })
      const json = await res.json()

      if (!res.ok) {
        // The question stays in the thread so the user can see what failed
        // and retry it, rather than having their typing silently discarded.
        toast({ title: 'Couldn’t answer that', description: json.error, variant: 'error' })
        return
      }
      setTurns([...next, { role: 'assistant', content: json.reply }])
    } catch {
      toast({
        title: 'Couldn’t reach the assistant',
        description: 'Check your connection and try again.',
        variant: 'error',
      })
    } finally {
      setBusy(false)
      inputRef.current?.focus()
    }
  }

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
          {turns.length === 0 ? (
            <div>
              <p className="text-xs leading-relaxed text-ink-muted">
                Ask about the applications in this territory — what&rsquo;s come
                up, which carry your scope, or anything about a specific scheme.
                It reads the same data you can see, and will say so when it
                can&rsquo;t find something.
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => ask(s)}
                    disabled={busy}
                    className="rounded-full border border-border bg-surface px-2.5 py-1 text-2xs font-medium text-ink-muted transition-[background-color,border-color,color] duration-fast ease-standard hover:border-primary-300 hover:bg-primary-50 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45 disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-h-80 space-y-3 overflow-y-auto pr-1" aria-live="polite">
              {turns.map((t, i) => (
                <div
                  key={i}
                  className={
                    t.role === 'user'
                      ? 'ml-6 rounded-md bg-primary-50 px-3 py-2 text-sm text-ink'
                      : 'mr-6 rounded-md bg-surface-sunken px-3 py-2 text-sm leading-relaxed text-ink'
                  }
                >
                  {/* whitespace-pre-wrap so a short list from the model keeps
                      its line breaks instead of collapsing into a paragraph. */}
                  <span className="whitespace-pre-wrap">
                    {t.role === 'assistant' ? formatReply(t.content) : t.content}
                  </span>
                </div>
              ))}
              {busy && (
                <div className="mr-6 rounded-md bg-surface-sunken px-3 py-2 text-sm text-ink-muted">
                  Looking through {areaLabel}&hellip;
                </div>
              )}
              <div ref={endRef} />
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault()
              ask(input)
            }}
            className="mt-3 flex gap-2"
          >
            <label htmlFor="territory-question" className="sr-only">
              Ask a question about {areaLabel}
            </label>
            <input
              id="territory-question"
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={busy}
              placeholder="Ask about this territory…"
              maxLength={300}
              className="w-full rounded-sm border border-border-control bg-surface px-3 py-2 text-sm text-ink placeholder:text-neutral-500 transition-[border-color,box-shadow] duration-fast ease-standard hover:border-primary-300 focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-500/15 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              aria-label="Send question"
              className="pp-lift inline-flex shrink-0 items-center rounded-sm bg-primary-500 px-3 text-white shadow-sm transition-[background-color,box-shadow,transform] duration-fast ease-standard hover:-translate-y-px hover:bg-primary-600 active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send size={15} aria-hidden="true" />
            </button>
          </form>

          <p className="mt-2 text-2xs leading-relaxed text-neutral-500">
            Answers come from the applications we hold for this territory.
            Always check the council record before acting on one.
          </p>
        </div>
      )}
    </div>
  )
}
