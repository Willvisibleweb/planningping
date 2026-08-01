'use client'

import { useState, type FormEvent } from 'react'

interface Props {
  locationSlug: string
  locationType: 'council' | 'postcode' | 'town'
  placeName: string
}

type State = 'idle' | 'submitting' | 'done' | 'error'

export default function AlertForm({ locationSlug, locationType, placeName }: Props) {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<State>('idle')
  const [message, setMessage] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setState('submitting')
    try {
      const res = await fetch('/api/alerts/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, location_slug: locationSlug, location_type: locationType }),
      })
      const data: { error?: string } = await res.json().catch(() => ({}))
      if (!res.ok) {
        setState('error')
        setMessage(data.error ?? 'Something went wrong. Please try again.')
        return
      }
      setState('done')
      setMessage(`You're on the list — we'll email you when a new application is submitted near ${placeName}.`)
    } catch {
      setState('error')
      setMessage('Could not reach the server. Please try again.')
    }
  }

  if (state === 'done') {
    return (
      <div className="rounded-xl border border-[#DCE7FF] bg-[#EFF4FF] px-5 py-4 text-sm text-[#1D4ED8]">
        {message}
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-[#DCE7FF] bg-[#F5F8FF] px-5 py-5">
      <label htmlFor="alert-email" className="block text-sm font-semibold text-[#111827]">
        Get alerted when a new application is submitted near {placeName}
      </label>
      <p className="mt-1 text-sm text-[#6B7280]">Free weekly email. No spam, unsubscribe anytime.</p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          id="alert-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          disabled={state === 'submitting'}
          className="w-full rounded-md border border-[#D1D5DB] bg-white px-3 py-2 text-sm text-[#111827] outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={state === 'submitting'}
          className="shrink-0 rounded-md bg-[#2563EB] px-5 py-2 text-sm font-medium text-white hover:bg-[#1D4ED8] transition-colors disabled:opacity-60"
        >
          {state === 'submitting' ? 'Signing up…' : 'Get alerts'}
        </button>
      </div>
      {state === 'error' && <p className="mt-2 text-sm text-[#B91C1C]">{message}</p>}
    </form>
  )
}
