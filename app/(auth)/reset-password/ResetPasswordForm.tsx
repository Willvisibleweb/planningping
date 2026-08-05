'use client'

import { useState, useTransition } from 'react'
import { sendResetEmail } from './actions'
import Button from '@/components/ui/Button'

export default function ResetPasswordForm() {
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [isPending, startTransition] = useTransition()

  async function handleSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const result = await sendResetEmail(formData)
      if (result?.error) setError(result.error)
      else setSent(true)
    })
  }

  if (sent) {
    return (
      <div className="rounded-md border border-border bg-surface p-7 text-center shadow-sm">
        <p className="text-sm text-ink">
          If that address is registered, you'll receive a reset link shortly.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-md border border-border bg-surface p-7 shadow-sm">
      <form action={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-ink mb-1">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="w-full rounded-md border border-border px-3 py-2 text-sm text-ink placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
          />
        </div>

        {error && (
          <p className="text-sm text-danger-600">{error}</p>
        )}

        <Button type="submit" fullWidth loading={isPending} loadingLabel="Sending reset link">
          Send reset link
        </Button>
      </form>

      <p className="mt-5 text-center text-xs text-ink-muted">
        <a href="/login" className="pp-link">
          Back to sign in
        </a>
      </p>
    </div>
  )
}
