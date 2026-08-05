'use client'

import { useState, useTransition } from 'react'
import { signup } from './actions'
import Button from '@/components/ui/Button'

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
      'CRM pipeline, lead scoring and AI outreach for civil engineers, agents and architects. 14-day free trial, no card required — then from £29/mo.',
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
      <div className="rounded-md border border-border bg-surface p-7 text-center shadow-sm">
        <p className="text-sm text-ink">
          Account created. Check your email to confirm your address before signing in.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-md border border-border bg-surface p-7 shadow-sm">
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
                  onChange={() => setUserType(t.value)}
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

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-ink mb-1">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="new-password"
            minLength={8}
            className="w-full rounded-md border border-border px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
          />
          <p className="mt-1 text-xs text-neutral-500">Minimum 8 characters</p>
        </div>

        {error && (
          <p className="text-sm text-danger-600">{error}</p>
        )}

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
        <a href="/login" className="pp-link">
          Sign in
        </a>
      </p>
    </div>
  )
}
