'use client'

// "In plain English" on the opportunity detail page.
//
// This page uses the council's description as its heading, which for a
// discharge-of-condition record means a 1,000-character statutory sentence
// where a title should be. The summary card sits directly under it and answers
// the question the heading failed to: what is actually being built, and is
// there civils work in it.
//
// Generated on demand rather than on page load. Every call is billed, most
// visits are a glance at the score and the agent, and charging a slot for a
// summary nobody reads would spend the daily allowance on nothing.

import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'

export default function ApplicationSummary({
  applicationId,
  description,
}: {
  applicationId: string
  description: string | null
}) {
  const [summary, setSummary] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const { toast } = useToast()

  // A description short enough to read at a glance is already its own summary.
  if (!description || description.trim().length < 140) return null

  async function summarise() {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch('/api/summarise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast({ title: 'Couldn’t summarise that', description: json.error, variant: 'error' })
        return
      }
      setSummary(json.summary)
    } catch {
      toast({
        title: 'Couldn’t summarise that',
        description: 'Check your connection and try again.',
        variant: 'error',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-md border border-border bg-surface p-4 sm:p-5 shadow-sm">
      <h3 className="flex items-center gap-1.5 text-sm font-medium text-ink">
        <Sparkles size={14} className="shrink-0 text-primary-500" aria-hidden="true" />
        In plain English
      </h3>

      {summary ? (
        <>
          <p className="mt-3 text-sm leading-relaxed text-ink">{summary}</p>
          <p className="mt-3 text-2xs leading-relaxed text-neutral-500">
            Written from the council&rsquo;s description by an AI model. A
            reading of the text, not a substitute for it — check the full
            description above before acting on it.
          </p>
        </>
      ) : (
        <>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">
            Council descriptions are written for the planning process, not for
            you. This strips the statutory phrasing and says what the scheme
            actually involves and whether it carries civils scope.
          </p>
          <div className="mt-4">
            <Button
              size="sm"
              variant="secondary"
              onClick={summarise}
              loading={busy}
              loadingLabel="Reading the description"
            >
              <Sparkles size={13} className="shrink-0" aria-hidden="true" />
              Summarise this application
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
