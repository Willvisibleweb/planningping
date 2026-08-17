'use client'

// Entering the six-digit code from the confirmation email.
//
// Replaces a confirmation link, which had a specific and annoying failure: the
// link opens wherever the email is read. Sign up on a laptop, open the email on
// your phone, and you are now signed in on the phone while the laptop — the tab
// you were actually using — sits unchanged, waiting forever with no way to
// continue. A code moves the secret to the device that already has the session
// in progress, so it does not matter where the email is read.
//
// Verified in the browser rather than through a server action, deliberately: a
// successful verification returns a session, and the browser client is what
// persists it to the auth cookie the rest of the app reads. Verifying on the
// server would confirm the account and then leave the user on a page that still
// thinks they are signed out.

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { MailCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Button from '@/components/ui/Button'
import { Alert } from '@/components/ui/ErrorState'

const CODE_LENGTH = 6

export default function VerifyCodeForm({ email }: { email: string }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [resent, setResent] = useState(false)
  const [isPending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  // The code box is the only thing on screen and the only thing to do next.
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  function submit(value: string) {
    setError(null)
    startTransition(async () => {
      const supabase = createClient()
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token: value,
        // 'signup' is the type for a code confirming a newly created account.
        type: 'signup',
      })

      if (verifyError) {
        setError(
          verifyError.message.toLowerCase().includes('expired')
            ? 'That code has expired. Send a new one below.'
            : 'That code is not right. Check the email and try again.',
        )
        setCode('')
        inputRef.current?.focus()
        return
      }

      // Straight into setup rather than the dashboard: the account has no
      // territory yet, and onboarding redirects on to the dashboard the moment
      // one exists.
      router.push('/onboarding')
      router.refresh()
    })
  }

  function handleChange(raw: string) {
    // Digits only, capped — so a pasted "Your code is 123456" still works.
    const digits = raw.replace(/\D/g, '').slice(0, CODE_LENGTH)
    setCode(digits)
    setError(null)
    // Submitting on the last digit saves a click, and there is nothing else on
    // this screen the user might have meant to do instead.
    if (digits.length === CODE_LENGTH) submit(digits)
  }

  function resend() {
    setError(null)
    startTransition(async () => {
      const supabase = createClient()
      const { error: resendError } = await supabase.auth.resend({ type: 'signup', email })
      if (resendError) {
        setError('Could not send another code just yet. Wait a minute and try again.')
        return
      }
      setResent(true)
    })
  }

  return (
    <div className="rounded-md border border-border bg-surface p-5 sm:p-7 text-center shadow-sm">
      <div className="mx-auto mb-4 grid size-11 place-items-center rounded-full bg-success-50 text-success-600 ring-1 ring-inset ring-success-200">
        <MailCheck size={20} aria-hidden="true" />
      </div>

      <p className="text-sm font-semibold tracking-tight text-ink">Check your email</p>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
        We&rsquo;ve sent a {CODE_LENGTH}-digit code to{' '}
        <span className="font-medium text-ink">{email}</span>. Enter it here to
        finish setting up — you can read the email anywhere, the code works on
        this device.
      </p>

      <label htmlFor="otp" className="sr-only">
        {CODE_LENGTH}-digit confirmation code
      </label>
      <input
        id="otp"
        ref={inputRef}
        value={code}
        onChange={(e) => handleChange(e.target.value)}
        disabled={isPending}
        inputMode="numeric"
        // Lets iOS and Android offer the code straight from the SMS/email
        // notification instead of making the user switch apps to read it.
        autoComplete="one-time-code"
        placeholder="000000"
        aria-describedby={error ? 'otp-error' : undefined}
        className="tabular-data mt-5 w-full rounded-sm border border-border-control bg-surface px-3 py-3 text-center text-2xl font-semibold tracking-[0.4em] text-ink placeholder:text-neutral-300 transition-[border-color,box-shadow] duration-fast ease-standard hover:border-primary-300 focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-500/15 disabled:opacity-60"
      />

      {error && (
        <div id="otp-error">
          <Alert tone="danger" className="mt-3 text-left">
            {error}
          </Alert>
        </div>
      )}

      {resent && !error && (
        <p className="mt-3 text-xs text-success-600">A new code is on its way.</p>
      )}

      <Button
        onClick={() => submit(code)}
        disabled={code.length !== CODE_LENGTH}
        loading={isPending}
        loadingLabel="Checking code"
        className="mt-4 w-full"
      >
        Confirm
      </Button>

      <button
        type="button"
        onClick={resend}
        disabled={isPending}
        className="mt-3 rounded-sm text-xs font-medium text-ink-muted transition-colors duration-fast ease-standard hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45 focus-visible:ring-offset-2 disabled:opacity-50"
      >
        Didn&rsquo;t get it? Send another code
      </button>
    </div>
  )
}
