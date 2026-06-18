'use client'

// Outreach modal: on open it asks /api/outreach for a draft, lets the user edit
// it, and "Mark as Sent" logs the contact date via the markAsSent server action.
// Nothing is sent anywhere automatically — the user copies the draft out.

import { useEffect, useState, useTransition } from 'react'
import { markAsSent } from './leadActions'
import type { TrackedLead } from '@/types/database'

export default function OutreachModal({
  lead,
  onClose,
}: {
  lead: TrackedLead
  onClose: () => void
}) {
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Generate a draft once when the modal opens.
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
        if (!res.ok) setError(json.error ?? 'Could not generate a draft.')
        else setDraft(json.draft ?? '')
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Outreach draft</h3>
            <p className="font-mono text-xs text-gray-400">{lead.reference}</p>
          </div>
          <button onClick={onClose} className="text-sm text-gray-400 hover:text-gray-700">
            ✕
          </button>
        </div>

        {loading ? (
          <div className="py-12 text-center text-sm text-gray-500">Drafting…</div>
        ) : error ? (
          <p className="py-8 text-center text-sm text-red-600">{error}</p>
        ) : (
          <>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={12}
              className="w-full rounded-md border border-gray-200 p-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
            />
            <p className="mt-1 text-xs text-gray-400">
              Edit freely, then copy into your email client. Marking as sent logs today
              as the contact date.
            </p>

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={onClose}
                className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900"
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
