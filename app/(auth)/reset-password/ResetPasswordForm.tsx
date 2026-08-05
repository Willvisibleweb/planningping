'use client'

import { useState, useTransition } from 'react'
import { MailCheck } from 'lucide-react'
import { sendResetEmail } from './actions'
import Button from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { Alert } from '@/components/ui/ErrorState'

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
        <div className="mx-auto mb-4 grid size-11 place-items-center rounded-full bg-success-50 text-success-600 ring-1 ring-inset ring-success-200">
          <MailCheck size={20} aria-hidden="true" />
        </div>
        <p className="text-sm font-semibold tracking-tight text-ink">Check your email</p>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
          If that address is registered, a reset link is on its way.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-md border border-border bg-surface p-7 shadow-sm">
      <form action={handleSubmit} className="space-y-4">
        <Field label="Email" hint="We'll send a reset link to this address.">
          {(p) => (
            <Input
              {...p}
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@firm.co.uk"
            />
          )}
        </Field>

        {error && <Alert tone="danger">{error}</Alert>}

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
