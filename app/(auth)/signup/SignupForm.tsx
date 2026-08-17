'use client'

import { useState, useTransition } from 'react'
import { signup } from './actions'
import VerifyCodeForm from './VerifyCodeForm'
import Button from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { Alert } from '@/components/ui/ErrorState'
import Link from 'next/link'

export default function SignupForm() {
  const [error, setError] = useState<string | null>(null)
  // The address the code was sent to. verifyOtp needs it alongside the code,
  // and asking the user to retype it would be absurd when we already have it.
  const [pendingEmail, setPendingEmail] = useState<string | null>(null)
  // Always professional now — retained because the partner question below
  // is gated on it, and because the signup action still accepts the column.
  const userType = 'professional'
  const [isPartner, setIsPartner] = useState(false)
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  async function handleSubmit(formData: FormData) {
    setError(null)
    // Read the address BEFORE the action runs, not after.
    //
    // React resets the form once a form action resolves, and the FormData that
    // was handed to a server action is not guaranteed to still read back on the
    // client afterwards. Reading it after the await returned null, so
    // pendingEmail stayed null, so the component fell through to rendering the
    // form again — which looked exactly like "it sent the code and dumped me
    // back on the signup page".
    const email = (formData.get('email') as string | null)?.trim() ?? ''

    startTransition(async () => {
      const result = await signup(formData)
      if (result?.error) {
        setError(result.error)
        return
      }
      if (!email) {
        // Should be impossible — the field is required — but falling back to a
        // message beats silently re-rendering the form with no explanation,
        // which is the failure this whole comment is about.
        setError('Account created, but we lost track of your email address. Sign in to continue.')
        return
      }
      setPendingEmail(email)
    })
  }

  // Swaps the form for the code box in place, keeping the user on the tab they
  // started in — which is the entire point of moving off a confirmation link.
  if (pendingEmail) {
    return <VerifyCodeForm email={pendingEmail} />
  }

  return (
    <div className="rounded-md border border-border bg-surface p-5 sm:p-7 shadow-sm">
      <form action={handleSubmit} className="space-y-4">
        {/* Account type is no longer a question. PlanningPing sells to
            construction firms now, so every new account is professional and the
            radio group that used to offer "I'm a homeowner" is gone. The hidden
            field is what actually carries it: the server action reads
            user_type from the form, so dropping the input entirely would have
            silently created homeowner accounts for everyone — it falls back to
            homeowner when the field is absent. Existing homeowner accounts are
            untouched and keep working. */}
        <input type="hidden" name="user_type" value="professional" />


        {/* Partner question, professional accounts only. GabrielCAM's customers
            are construction firms, and showing this to homeowners would
            advertise a partnership almost none of them have any relationship
            with — which is the opposite of keeping the standard product clean.
            Answering "no" is the same as not answering: the field is simply
            absent from the form data. */}
        {userType === 'professional' && (
          <div className="rounded-sm border border-border bg-primary-50/50 p-4">
            <label className="flex cursor-pointer items-start gap-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary-500/45 has-[:focus-visible]:ring-offset-2">
              <input
                type="checkbox"
                name="partnership_provider"
                value="gabrielcam"
                checked={isPartner}
                onChange={(e) => setIsPartner(e.target.checked)}
                className="mt-0.5 size-4 shrink-0 accent-primary-500 focus-visible:outline-none"
              />
              <span>
                <span className="block text-sm font-medium text-ink">
                  I&rsquo;m a GabrielCAM partner or client
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-ink-muted">
                  Adds site-monitoring options to applications you track. Leave this
                  unticked if you don&rsquo;t work with GabrielCAM — you can change it
                  later in Settings.
                </span>
              </span>
            </label>
          </div>
        )}

        <Field label="Email" required>
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

        {/* Validated on blur rather than on every keystroke — telling someone
            their password is too short while they're still typing it is
            noise, not help. */}
        <Field
          label="Password"
          required
          error={passwordError}
          hint="At least 8 characters."
        >
          {(p) => (
            <Input
              {...p}
              name="password"
              type="password"
              required
              autoComplete="new-password"
              minLength={8}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                if (passwordError) setPasswordError(null)
              }}
              onBlur={() =>
                setPasswordError(
                  password.length > 0 && password.length < 8
                    ? `That's ${password.length} character${password.length === 1 ? '' : 's'} — you need at least 8.`
                    : null,
                )
              }
            />
          )}
        </Field>

        {error && <Alert tone="danger">{error}</Alert>}

        <p className="text-xs leading-relaxed text-ink-muted">
          By creating an account you agree to our{' '}
          <a
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="pp-link"
          >
            Terms of Service
          </a>{' '}
          and{' '}
          <a
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="pp-link"
          >
            Privacy Policy
          </a>
          . PlanningPing provides automated alerts from public planning data on an
          &ldquo;as is&rdquo; basis and is not a substitute for your own checks against
          official sources.
        </p>

        <Button type="submit" fullWidth loading={isPending} loadingLabel="Creating account">
          Create account
        </Button>
      </form>

      <p className="mt-5 text-center text-xs text-ink-muted">
        Already have an account?{' '}
        <Link href="/login" className="pp-link">
          Sign in
        </Link>
      </p>
    </div>
  )
}
