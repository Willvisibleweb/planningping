'use client'

// Outreach modal: on open it asks /api/outreach for an opportunity brief plus
// either 2-3 alternate email angles or one formal letter draft, lets the user
// edit it, and either "Mark as Sent" (logs the contact date) or, for
// letters, "Download PDF" (letterhead-formatted, for printing/posting).
// Nothing is sent anywhere automatically — the user copies/downloads the
// draft out themselves.
//
// Each mode is fetched at most once per modal open (cached in emailData/
// letterData) — switching the toggle back and forth must not burn the
// shared daily generation cap on repeat generations of the same lead.

import { useEffect, useRef, useState, useTransition } from 'react'
import { X } from 'lucide-react'
import { markAsSent } from './leadActions'
import Button from '@/components/ui/Button'
import Pill from '@/components/ui/Pill'
import { useToast } from '@/components/ui/Toast'
import type { TrackedLead } from '@/types/database'
import Link from 'next/link'

type Mode = 'email' | 'letter'

interface Brief {
  scope: string
  valueSignal: string
  reasoning: string
}

interface Angle {
  label: string
  subject: string
  body: string
}

function angleToText(angle: Angle): string {
  return `Subject: ${angle.subject}\n\n${angle.body}`
}

export default function OutreachModal({
  lead,
  onClose,
}: {
  lead: TrackedLead
  onClose: () => void
}) {
  const [mode, setMode] = useState<Mode>('email')

  const [emailData, setEmailData] = useState<{ brief: Brief; angles: Angle[] } | null>(null)
  const [selected, setSelected] = useState(0)
  const [edits, setEdits] = useState<Record<number, string>>({})

  const [letterData, setLetterData] = useState<{ brief: Brief; letterBody: string } | null>(null)
  const [letterEdit, setLetterEdit] = useState('')

  const fetchedModes = useRef<Set<Mode>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [sent, setSent] = useState(false)
  const { toast } = useToast()
  const [isPending, startTransition] = useTransition()

  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  // Split from loadMode so the mount effect can start a fetch without running
  // any setState synchronously in its body — `loading` already initialises to
  // true and `error` to null, so the initial call has nothing to reset. Every
  // setState below happens after an await. Same requests, same caching.
  async function fetchMode(m: Mode) {
    if (fetchedModes.current.has(m)) return
    try {
      const res = await fetch('/api/outreach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id, mode: m }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Could not generate a draft.')
        return
      }
      if (m === 'email') {
        setEmailData({ brief: json.brief ?? null, angles: json.angles ?? [] })
      } else {
        setLetterData({ brief: json.brief ?? null, letterBody: json.letterBody ?? '' })
        setLetterEdit(json.letterBody ?? '')
      }
      fetchedModes.current.add(m)
    } catch {
      setError('Could not reach the draft service.')
    } finally {
      setLoading(false)
    }
  }

  // Resets the visible state, then fetches. Used when the user switches mode;
  // the mount effect calls fetchMode directly instead.
  function loadMode(m: Mode) {
    setLoading(true)
    setError(null)
    void fetchMode(m)
  }

  useEffect(() => {
    // set-state-in-effect flags any call that transitively setStates, but every
    // setState inside fetchMode happens after an await — there is no cascading
    // render here. Fetching a draft when the modal opens for a given lead is
    // exactly what an effect is for, absent a data-fetching library.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see above
    void fetchMode('email')
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchMode is stable for this modal's lifetime
  }, [lead.id])

  function handleModeChange(m: Mode) {
    setMode(m)
    setError(null)
    if (!fetchedModes.current.has(m)) loadMode(m)
  }

  function handleMarkSent() {
    startTransition(async () => {
      const result = await markAsSent(lead.id)
      if (result?.error) {
        // Previously silent: the modal simply stayed open with the button
        // still saying "Mark as Sent", so a failure was indistinguishable
        // from a mis-click.
        toast({ title: 'Couldn’t log that contact', description: result.error, variant: 'error' })
        return
      }
      setSent(true)
      toast({
        title: 'Logged as contacted',
        description: `${lead.reference} moved to Contacted, dated today.`,
        variant: 'success',
      })
      setTimeout(onClose, 800)
    })
  }

  async function handleDownloadPdf() {
    setDownloadError(null)
    setIsDownloading(true)
    try {
      const res = await fetch('/api/outreach/letter-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id, letterBody: letterEdit }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setDownloadError(json.error ?? 'Could not generate the PDF.')
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `letter-${lead.reference}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      setDownloadError('Could not reach the PDF service.')
    } finally {
      setIsDownloading(false)
    }
  }

  const activeBrief = mode === 'email' ? emailData?.brief : letterData?.brief
  const angles = emailData?.angles ?? []
  const emailDraftText = edits[selected] ?? (angles[selected] ? angleToText(angles[selected]) : '')

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-lg bg-surface p-5 sm:p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold text-ink">Opportunity brief</h3>
            <p className="tabular-data text-xs text-ink-muted">{lead.reference}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close opportunity brief"
            className="-m-1 rounded-sm p-1 text-neutral-500 transition-colors duration-fast ease-standard hover:bg-neutral-100 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mb-3 flex gap-1.5">
          {(['email', 'letter'] as const).map((m) => (
            <Pill key={m} selected={m === mode} onClick={() => handleModeChange(m)}>
              {m === 'email' ? 'Email' : 'Formal letter'}
            </Pill>
          ))}
        </div>

        {loading ? (
          <div className="py-12 text-center text-sm text-ink-muted">Analysing…</div>
        ) : error ? (
          <p className="py-8 text-center text-sm text-danger-600">{error}</p>
        ) : (
          <>
            {activeBrief && (
              <div className="mb-4 rounded-md border border-border bg-primary-50 p-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded-sm bg-primary-500 px-2 py-0.5 text-xs font-semibold text-white">
                    {activeBrief.scope}
                  </span>
                  <span className="rounded-sm bg-surface-sunken px-2 py-0.5 text-xs text-ink-muted">
                    {activeBrief.valueSignal}
                  </span>
                </div>
                <p className="mt-2 text-sm text-ink">{activeBrief.reasoning}</p>
              </div>
            )}

            {mode === 'email' ? (
              <>
                {angles.length > 1 && (
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {angles.map((angle, i) => (
                      <Pill key={i} selected={i === selected} onClick={() => setSelected(i)}>
                        {angle.label}
                      </Pill>
                    ))}
                  </div>
                )}
                <textarea
                  value={emailDraftText}
                  onChange={(e) => setEdits((prev) => ({ ...prev, [selected]: e.target.value }))}
                  rows={11}
                  className="w-full rounded-sm border border-border-control bg-surface p-3.5 text-sm text-ink transition-[border-color,box-shadow] duration-fast ease-standard hover:border-primary-300 focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-500/15"
                />
                <p className="mt-1 text-xs text-ink-muted">
                  Edit freely, then copy into your email client. Marking as sent logs today
                  as the contact date.
                </p>
              </>
            ) : (
              <>
                <textarea
                  value={letterEdit}
                  onChange={(e) => setLetterEdit(e.target.value)}
                  rows={11}
                  className="w-full rounded-sm border border-border-control bg-surface p-3.5 text-sm text-ink transition-[border-color,box-shadow] duration-fast ease-standard hover:border-primary-300 focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-500/15"
                />
                <p className="mt-1 text-xs text-ink-muted">
                  Edit freely, then download as a PDF to print and post. Uses the firm
                  letterhead saved in{' '}
                  <Link href="/settings" className="pp-link font-medium">
                    Settings
                  </Link>{' '}
                  — optional, the letter still downloads fine without one.
                </p>
                {downloadError && <p className="mt-1 text-xs text-danger-600">{downloadError}</p>}
              </>
            )}

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={onClose}>
                Close
              </Button>
              {mode === 'letter' && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleDownloadPdf}
                  loading={isDownloading}
                  loadingLabel="Preparing PDF"
                >
                  Download PDF
                </Button>
              )}
              <Button
                size="sm"
                onClick={handleMarkSent}
                disabled={sent}
                loading={isPending}
                loadingLabel="Marking as sent"
              >
                {sent ? 'Marked ✓' : 'Mark as Sent'}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
