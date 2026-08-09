'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { verifyChallenge } from '../../(dashboard)/settings/mfaActions'
import Button from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { Alert } from '@/components/ui/ErrorState'

export default function TwoFactorChallengeForm() {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await verifyChallenge(code)
      if (result?.error) {
        setError(result.error)
        setCode('')
        return
      }
      router.replace('/dashboard')
      router.refresh()
    })
  }

  // Signing out has to be reachable from here. Without it, someone who has lost
  // their authenticator is stuck on this screen with no way back to the login
  // page — their session is valid, so every route just bounces them here again.
  async function signOut() {
    await createClient().auth.signOut()
    router.replace('/login')
    router.refresh()
  }

  return (
    <div className="rounded-md border border-border bg-surface p-5 shadow-sm sm:p-7">
      <div className="mx-auto mb-4 grid size-11 place-items-center rounded-full bg-primary-50 text-primary-600 ring-1 ring-inset ring-primary-200">
        <ShieldCheck size={20} aria-hidden="true" />
      </div>

      <h1 className="text-center text-base font-semibold tracking-tight text-ink">
        Enter your code
      </h1>
      <p className="mt-1.5 text-center text-sm leading-relaxed text-ink-muted">
        Open your authenticator app and enter the 6-digit code for PlanningPing.
      </p>

      <form onSubmit={submit} className="mt-6 space-y-4">
        <Field label="Verification code">
          {(p) => (
            <Input
              {...p}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              placeholder="000000"
              maxLength={7}
              className="tabular-data text-center text-lg tracking-[0.3em]"
            />
          )}
        </Field>

        {error && <Alert tone="danger">{error}</Alert>}

        <Button type="submit" fullWidth loading={isPending} loadingLabel="Checking your code">
          Verify
        </Button>
      </form>

      <p className="mt-5 text-center text-xs leading-relaxed text-ink-muted">
        Lost your phone?{' '}
        <button
          onClick={signOut}
          className="pp-link font-medium"
        >
          Sign out
        </button>{' '}
        and email us — we&rsquo;ll remove it from your account.
      </p>
    </div>
  )
}
