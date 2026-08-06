'use client'

import { useState, useTransition } from 'react'
import { MailCheck } from 'lucide-react'
import { signup } from './actions'
import { PRICING } from '@/lib/stripe'
import Button from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { Alert } from '@/components/ui/ErrorState'
import Link from 'next/link'

// Trial length and price read from lib/stripe's PRICING rather than being
// retyped here. Hardcoding these is how "20+ councils" ended up on the landing
// page long after it stopped being true.
const USER_TYPES = [
  {
    value: 'homeowner',
    title: "I'm a homeowner",
    description: 'Follow planning applications near you and get a weekly email digest. Free forever.',
  },
  {
    value: 'professional',
    title: "I'm a professional",
    description:
      `CRM pipeline, lead scoring and AI outreach for civil engineers, agents and architects. ${PRICING.trialDays}-day free trial, no card required — then from £${PRICING.mid.monthly.amount}/mo.`,
  },
] as const

export default function SignupForm({
  defaultType = 'homeowner',
}: {
  defaultType?: 'homeowner' | 'professional'
}) {
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [userType, setUserType] = useState<string>(defaultType)
  const [isPartner, setIsPartner] = useState(false)
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  async function handleSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const result = await signup(formData)
      if (result?.error) setError(result.error)
      else setSuccess(true)
    })
  }

  if (success) {
    return (
      <div className="rounded-md border border-border bg-surface p-5 sm:p-7 text-center shadow-sm">
        <div className="mx-auto mb-4 grid size-11 place-items-center rounded-full bg-success-50 text-success-600 ring-1 ring-inset ring-success-200">
          <MailCheck size={20} aria-hidden="true" />
        </div>
        <p className="text-sm font-semibold tracking-tight text-ink">Account created</p>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
          Confirm your address from the email we&rsquo;ve just sent, then sign in and add
          your first territory.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-md border border-border bg-surface p-5 sm:p-7 shadow-sm">
      <form action={handleSubmit} className="space-y-4">
        <fieldset>
          <legend className="block text-sm font-medium text-ink mb-2">
            How will you use PlanningPing?
          </legend>
          <div className="space-y-2">
            {USER_TYPES.map((t) => (
              // The radio itself is sr-only, so without has-[:focus-visible]
              // the keyboard focus indicator for this control was invisible —
              // you could tab onto it with nothing on screen to show it.
              <label
                key={t.value}
                className={`block cursor-pointer rounded-sm border p-4 transition-[background-color,border-color,box-shadow] duration-fast ease-standard has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary-500/45 has-[:focus-visible]:ring-offset-2 ${
                  userType === t.value
                    ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-500'
                    : 'border-border hover:border-primary-300 hover:bg-primary-50/40'
                }`}
              >
                <input
                  type="radio"
                  name="user_type"
                  value={t.value}
                  checked={userType === t.value}
                  onChange={() => {
                    setUserType(t.value)
                    // Switching to homeowner clears the partner answer so it
                    // can't be submitted from a hidden field.
                    if (t.value !== 'professional') setIsPartner(false)
                  }}
                  className="sr-only"
                />
                <span className="block text-sm font-medium text-ink">{t.title}</span>
                <span className="mt-1 block text-xs leading-relaxed text-ink-muted">
                  {t.description}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

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
