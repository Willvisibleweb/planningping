'use client'

// The conversation mechanics shared by both assistants.
//
// PlanPal and the territory assistant differ in what they can see and how they
// are framed, but the turn-taking, the error handling, the scroll behaviour and
// the bold rendering are identical. Sharing them means a fix lands in both
// rather than in whichever one someone remembered.
//
// Deliberately owns no chrome: each parent supplies its own heading, because
// one is a collapsible strip inside a territory page and the other is a card at
// the top of the dashboard.

import { useEffect, useRef, useState } from 'react'
import { Send } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'

export interface Turn {
  role: 'user' | 'assistant'
  content: string
}

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

export default function AssistantChat({
  endpoint,
  extraBody,
  suggestions,
  intro,
  placeholder,
  thinkingLabel,
  inputId,
  inputLabel,
  footnote,
}: {
  endpoint: string
  /** Merged into the request body alongside `messages` — e.g. an areaId. */
  extraBody?: Record<string, unknown>
  suggestions: string[]
  intro: React.ReactNode
  placeholder: string
  thinkingLabel: string
  inputId: string
  inputLabel: string
  footnote: React.ReactNode
}) {
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
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...extraBody, messages: next }),
      })
      const json = await res.json()

      if (!res.ok) {
        // The question stays in the thread so the user can see what failed and
        // retry it, rather than having their typing silently discarded.
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
    <div>
      {turns.length === 0 ? (
        <div>
          {intro}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
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
              {/* whitespace-pre-wrap so a short list from the model keeps its
                  line breaks instead of collapsing into a paragraph. */}
              <span className="whitespace-pre-wrap">
                {t.role === 'assistant' ? formatReply(t.content) : t.content}
              </span>
            </div>
          ))}
          {busy && (
            <div className="mr-6 rounded-md bg-surface-sunken px-3 py-2 text-sm text-ink-muted">
              {thinkingLabel}
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
        <label htmlFor={inputId} className="sr-only">
          {inputLabel}
        </label>
        <input
          id={inputId}
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={busy}
          placeholder={placeholder}
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

      <p className="mt-2 text-2xs leading-relaxed text-neutral-500">{footnote}</p>
    </div>
  )
}
