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

// Supabase's confirmation token length is a project setting (Authentication →
// Providers → Email → Email OTP Length), not a constant we control, and it is
// not always six — this project was observed issuing eight characters. So the
// input accepts a range instead of asserting a length it cannot know.
//
// Nor is the code necessarily numeric. The first version stripped every
// non-digit as it was typed, which silently deleted characters out of an
// alphanumeric code and left the user staring at an input that refused to hold
// what the email plainly said.
const MIN_CODE_LENGTH = 6
const MAX_CODE_LENGTH = 10

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

      // Supabase is inconsistent about which type names a signup confirmation:
      // its own reference documents `type: 'email'` under "Verify Signup OTP",
      // while `'signup'` is the type the signUp flow issues. Which one a project
      // accepts depends on how the account was created, and getting it wrong
      // returns a generic invalid-token error indistinguishable from the user
      // mistyping. Trying both costs one extra request on a path taken once per
      // account, and removes a whole class of "the code is right but it says
      // it's wrong".
      let verifyError = (
        await supabase.auth.verifyOtp({ email, token: value, type: 'signup' })
      ).error

      if (verifyError) {
        verifyError = (
          await supabase.auth.verifyOtp({ email, token: value, type: 'email' })
        ).error
      }

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
    // Strip only whitespace and punctuation, keeping letters and digits, so a
    // pasted "Your code is: ABC-12345" still lands correctly. Uppercased
    // because Supabase issues uppercase and the comparison is exact.
    const cleaned = raw
      .replace(/[^A-Za-z0-9]/g, '')
      .toUpperCase()
      .slice(0, MAX_CODE_LENGTH)
    setCode(cleaned)
    setError(null)
    // No auto-submit. It would have to guess the length, and guessing six
    // against an eight-character code means firing two characters early and
    // showing a wrong-code error to someone who typed it correctly.
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
        We&rsquo;ve sent a code to{' '}
        <span className="font-medium text-ink">{email}</span>. Enter it here to
        finish setting up — you can read the email anywhere, the code works on
        this device.
      </p>

      <label htmlFor="otp" className="sr-only">
        Confirmation code from your email
      </label>
      <input
        id="otp"
        ref={inputRef}
        value={code}
        onChange={(e) => handleChange(e.target.value)}
        disabled={isPending}
        inputMode="text"
        // Lets iOS and Android offer the code straight from the SMS/email
        // notification instead of making the user switch apps to read it.
        autoComplete="one-time-code"
        placeholder="Enter code"
        aria-describedby={error ? 'otp-error' : undefined}
        className="tabular-data mt-5 w-full rounded-sm border border-border-control bg-surface px-3 py-3 text-center text-2xl font-semibold tracking-[0.3em] uppercase text-ink placeholder:text-neutral-300 transition-[border-color,box-shadow] duration-fast ease-standard hover:border-primary-300 focus:border-primary-500 focus:outline-none focus:ring-4 focus:ring-primary-500/15 disabled:opacity-60"
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
        disabled={code.length < MIN_CODE_LENGTH}
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
