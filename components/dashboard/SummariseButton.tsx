'use client'

// "Summarise" on one application row.
//
// Council descriptions are often unreadable — 400 words of statutory clause
// with the actual works buried in the middle. This turns one into two
// sentences, inline, without leaving the list.
//
// The summary renders under the row rather than in a modal on purpose: the
// point is to skim several without losing your place.

import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'

export default function SummariseButton({
  applicationId,
  description,
}: {
  applicationId: string
  description: string | null
}) {
  const [summary, setSummary] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const { toast } = useToast()

  // A one-line description is already its own summary — offering to shorten it
  // would spend a call to save nobody anything.
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

  if (summary) {
    return (
      <div className="mt-2 w-full rounded-sm border border-primary-200 bg-primary-50/60 px-3 py-2">
        <p className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-primary-700">
          <Sparkles size={11} aria-hidden="true" />
          In plain English
        </p>
        <p className="mt-1 text-xs leading-relaxed text-ink">{summary}</p>
      </div>
    )
  }

  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={summarise}
      loading={busy}
      loadingLabel="Summarising"
    >
      <Sparkles size={13} className="shrink-0" aria-hidden="true" />
      Summarise
    </Button>
  )
}
