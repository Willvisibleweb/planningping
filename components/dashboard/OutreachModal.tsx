'use client'

// Outreach modal: on open it asks /api/outreach for an opportunity brief plus
// 2-3 alternate email angles, lets the user pick an angle and edit it, and
// "Mark as Sent" logs the contact date via the markAsSent server action.
// Nothing is sent anywhere automatically — the user copies the draft out.

import { useEffect, useState, useTransition } from 'react'
import { markAsSent } from './leadActions'
import type { TrackedLead } from '@/types/database'

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
  const [brief, setBrief] = useState<Brief | null>(null)
  const [angles, setAngles] = useState<Angle[]>([])
  const [selected, setSelected] = useState(0)
  // Per-angle edited text, keyed by index — so switching angles doesn't lose edits.
  const [edits, setEdits] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Generate once when the modal opens.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch('/api/outreach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId: lead.id }),
    })
      .then(async (res) => {
        const json = await res.json()
        if (cancelled) return
        if (!res.ok) {
          setError(json.error ?? 'Could not generate a draft.')
        } else {
          setBrief(json.brief ?? null)
          setAngles(json.angles ?? [])
        }
      })
      .catch(() => { if (!cancelled) setError('Could not reach the draft service.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [lead.id])

  function handleMarkSent() {
    startTransition(async () => {
      const result = await markAsSent(lead.id)
      if (!result?.error) {
        setSent(true)
        setTimeout(onClose, 800)
      }
    })
  }

  const draftText = edits[selected] ?? (angles[selected] ? angleToText(angles[selected]) : '')

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

        {loading ? (
          <div className="py-12 text-center text-sm text-[#6B6C70]">Analysing…</div>
        ) : error ? (
          <p className="py-8 text-center text-sm text-red-600">{error}</p>
        ) : (
          <>
            {brief && (
              <div className="mb-4 rounded-md border border-[#D6E4FB] bg-[#F7F9FF] p-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded bg-[#2563EB] px-2 py-0.5 text-xs font-semibold text-white">
                    {brief.scope}
                  </span>
                  <span className="rounded bg-[#F7F7F8] px-2 py-0.5 text-xs text-[#6B6C70]">
                    {brief.valueSignal}
                  </span>
                </div>
                <p className="mt-2 text-sm text-[#202124]">{brief.reasoning}</p>
              </div>
            )}

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
              value={draftText}
              onChange={(e) => setEdits((prev) => ({ ...prev, [selected]: e.target.value }))}
              rows={11}
              className="w-full rounded-md border border-[#D6E4FB] p-3 text-sm text-[#202124] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
            />
            <p className="mt-1 text-xs text-[#A0A1A6]">
              Edit freely, then copy into your email client. Marking as sent logs today
              as the contact date.
            </p>

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={onClose}
                className="rounded-md px-3 py-1.5 text-sm text-[#6B6C70] hover:text-[#202124]"
              >
                Close
              </button>
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
