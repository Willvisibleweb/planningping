'use client'

import { useState, useTransition } from 'react'
import { MailCheck } from 'lucide-react'
import { loginWithPassword, loginWithMagicLink } from './actions'
import Button from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { Alert } from '@/components/ui/ErrorState'
import Link from 'next/link'

export default function AuthForm() {
  const [mode, setMode] = useState<'password' | 'magic'>('password')
  const [error, setError] = useState<string | null>(null)
  const [magicSent, setMagicSent] = useState(false)
  const [isPending, startTransition] = useTransition()

  async function handleSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      if (mode === 'password') {
        const result = await loginWithPassword(formData)
        if (result?.error) setError(result.error)
      } else {
        const result = await loginWithMagicLink(formData)
        if (result?.error) setError(result.error)
        else setMagicSent(true)
      }
    })
  }

  if (magicSent) {
    return (
      <div className="rounded-md border border-border bg-surface p-7 text-center shadow-sm">
        <div className="mx-auto mb-4 grid size-11 place-items-center rounded-full bg-success-50 text-success-600 ring-1 ring-inset ring-success-200">
          <MailCheck size={20} aria-hidden="true" />
        </div>
        <p className="text-sm font-semibold tracking-tight text-ink">Check your email</p>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
          We&rsquo;ve sent a sign-in link. It expires in an hour — request another if it lapses.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-md border border-border bg-surface p-7 shadow-sm">
      <form action={handleSubmit} className="space-y-5">
        <Field label="Email">
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

        {mode === 'password' && (
          <Field
            label="Password"
            labelAction={
              <Link href="/reset-password" className="pp-link text-xs">
                Forgot password?
              </Link>
            }
          >
            {(p) => (
              <Input {...p} name="password" type="password" required autoComplete="current-password" />
            )}
          </Field>
        )}

        {/* Sign-in failures come back from Supabase, so they're surfaced as a
            form-level alert rather than pinned to a field — we don't know
            which of the two was wrong, and guessing would be worse. */}
        {error && <Alert tone="danger">{error}</Alert>}

        {/* The label swaps between modes, so the button is sized to the widest
            of them — switching mode can't nudge the card's height or width. */}
        <Button
          type="submit"
          fullWidth
          loading={isPending}
          loadingLabel={mode === 'password' ? 'Signing in' : 'Sending magic link'}
        >
          {mode === 'password' ? 'Sign in' : 'Send magic link'}
        </Button>
      </form>

      <div className="mt-5 text-center">
        <button
          onClick={() => { setMode(mode === 'password' ? 'magic' : 'password'); setError(null) }}
          className="rounded-sm text-xs text-ink-muted transition-colors duration-fast ease-standard hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45 focus-visible:ring-offset-2"
        >
          {mode === 'password' ? 'Sign in with magic link instead' : 'Sign in with password instead'}
        </button>
      </div>

      <p className="mt-4 text-center text-xs text-ink-muted">
        No account?{' '}
        <Link href="/signup" className="pp-link">
          Sign up
        </Link>
      </p>
    </div>
  )
}
