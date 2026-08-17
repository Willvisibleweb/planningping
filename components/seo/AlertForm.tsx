'use client'

import { useState, type FormEvent } from 'react'
import Button from '@/components/ui/Button'
import { Alert } from '@/components/ui/ErrorState'

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
      <div className="rounded-md border border-border bg-primary-100 px-5 py-4 text-sm text-primary-600">
        {message}
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-md border border-border bg-primary-50 p-6">
      <label htmlFor="alert-email" className="block text-sm font-semibold tracking-tight text-ink">
        Working in {placeName}? Get the schemes worth quoting.
      </label>
      <p className="mt-1.5 text-sm text-ink-muted">
        A free weekly email of new applications here, scored for civils scope —
        drainage, highways, groundworks and structures. Unsubscribe anytime.
      </p>
      <div className="mt-4 flex flex-col gap-2.5 sm:flex-row">
        <input
          id="alert-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          disabled={state === 'submitting'}
          className="w-full rounded-sm border border-border-control bg-surface px-3 py-2 text-sm text-ink placeholder:text-neutral-500 transition-[border-color,box-shadow] duration-fast ease-standard hover:border-primary-300 focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-500/15 disabled:cursor-not-allowed disabled:opacity-60"
        />
        <Button
          type="submit"
          className="shrink-0"
          loading={state === 'submitting'}
          loadingLabel="Signing you up"
        >
          Get alerts
        </Button>
      </div>
      {state === 'error' && (
        <Alert tone="danger" className="mt-3">
          {message}
        </Alert>
      )}
    </form>
  )
}
