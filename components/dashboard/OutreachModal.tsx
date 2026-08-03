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
import { markAsSent } from './leadActions'
import type { TrackedLead } from '@/types/database'

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
  const [isPending, startTransition] = useTransition()

  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  async function loadMode(m: Mode) {
    if (fetchedModes.current.has(m)) return
    setLoading(true)
    setError(null)
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

  useEffect(() => {
    loadMode('email')
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadMode is stable for this modal's lifetime
  }, [lead.id])

  function handleModeChange(m: Mode) {
    setMode(m)
    setError(null)
    if (!fetchedModes.current.has(m)) void loadMode(m)
  }

  function handleMarkSent() {
    startTransition(async () => {
      const result = await markAsSent(lead.id)
      if (!result?.error) {
        setSent(true)
        setTimeout(onClose, 800)
      }
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
        className="w-full max-w-xl rounded-lg bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold text-[#202124]">Opportunity brief</h3>
            <p className="font-mono text-xs text-[#A0A1A6]">{lead.reference}</p>
          </div>
          <button onClick={onClose} className="text-sm text-[#A0A1A6] hover:text-[#202124]">
            ✕
          </button>
        </div>

        <div className="mb-3 flex gap-1.5">
          {(['email', 'letter'] as const).map((m) => (
            <button
              key={m}
              onClick={() => handleModeChange(m)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                m === mode
                  ? 'border-[#2563EB] bg-[#2563EB] text-white'
                  : 'border-[#D6E4FB] bg-white text-[#6B6C70] hover:border-[#2563EB]'
              }`}
            >
              {m === 'email' ? 'Email' : 'Formal letter'}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="py-12 text-center text-sm text-[#6B6C70]">Analysing…</div>
        ) : error ? (
          <p className="py-8 text-center text-sm text-red-600">{error}</p>
        ) : (
          <>
            {activeBrief && (
              <div className="mb-4 rounded-md border border-[#D6E4FB] bg-[#F7F9FF] p-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded bg-[#2563EB] px-2 py-0.5 text-xs font-semibold text-white">
                    {activeBrief.scope}
                  </span>
                  <span className="rounded bg-[#F7F7F8] px-2 py-0.5 text-xs text-[#6B6C70]">
                    {activeBrief.valueSignal}
                  </span>
                </div>
                <p className="mt-2 text-sm text-[#202124]">{activeBrief.reasoning}</p>
              </div>
            )}

            {mode === 'email' ? (
              <>
                {angles.length > 1 && (
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {angles.map((angle, i) => (
                      <button
                        key={i}
                        onClick={() => setSelected(i)}
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                          i === selected
                            ? 'border-[#2563EB] bg-[#2563EB] text-white'
                            : 'border-[#D6E4FB] bg-white text-[#6B6C70] hover:border-[#2563EB]'
                        }`}
                      >
                        {angle.label}
                      </button>
                    ))}
                  </div>
                )}
                <textarea
                  value={emailDraftText}
                  onChange={(e) => setEdits((prev) => ({ ...prev, [selected]: e.target.value }))}
                  rows={11}
                  className="w-full rounded-md border border-[#D6E4FB] p-3 text-sm text-[#202124] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                />
                <p className="mt-1 text-xs text-[#A0A1A6]">
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
                  className="w-full rounded-md border border-[#D6E4FB] p-3 text-sm text-[#202124] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                />
                <p className="mt-1 text-xs text-[#A0A1A6]">
                  Edit freely, then download as a PDF to print and post. Uses the firm
                  letterhead saved in{' '}
                  <a href="/settings" className="font-medium text-[#2563EB] hover:underline">
                    Settings
                  </a>{' '}
                  — optional, the letter still downloads fine without one.
                </p>
                {downloadError && <p className="mt-1 text-xs text-red-600">{downloadError}</p>}
              </>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={onClose}
                className="rounded-md px-3 py-1.5 text-sm text-[#6B6C70] hover:text-[#202124]"
              >
                Close
              </button>
              {mode === 'letter' && (
                <button
                  onClick={handleDownloadPdf}
                  disabled={isDownloading}
                  className="rounded-md border border-[#2563EB] px-3 py-1.5 text-sm font-medium text-[#2563EB] transition-colors hover:bg-[#2563EB] hover:text-white disabled:opacity-50"
                >
                  {isDownloading ? 'Preparing…' : 'Download PDF'}
                </button>
              )}
              <button
                onClick={handleMarkSent}
                disabled={isPending || sent}
                className="rounded-md bg-[#2563EB] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#1D4ED8] transition-colors disabled:opacity-50"
              >
                {sent ? 'Marked ✓' : isPending ? 'Saving…' : 'Mark as Sent'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
