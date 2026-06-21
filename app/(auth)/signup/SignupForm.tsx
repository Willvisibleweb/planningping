'use client'

import { useState, useTransition } from 'react'
import { signup } from './actions'

export default function SignupForm() {
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
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
      <div className="rounded-lg border border-[#E5E7EB] bg-white p-6 text-center shadow-sm">
        <p className="text-sm text-[#374151]">
          Account created. Check your email to confirm your address before signing in.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-[#E5E7EB] bg-white p-6 shadow-sm">
      <form action={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-[#374151] mb-1">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="w-full rounded-md border border-[#E5E7EB] px-3 py-2 text-sm text-[#111827] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-[#374151] mb-1">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="new-password"
            minLength={8}
            className="w-full rounded-md border border-[#E5E7EB] px-3 py-2 text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
          />
          <p className="mt-1 text-xs text-[#9CA3AF]">Minimum 8 characters</p>
        </div>

        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        <p className="text-xs leading-relaxed text-[#6B7280]">
          By creating an account you agree to our{' '}
          <a
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#2563EB] hover:underline"
          >
            Terms of Service
          </a>{' '}
          and{' '}
          <a
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#2563EB] hover:underline"
          >
            Privacy Policy
          </a>
          . PlanningPing provides automated alerts from public planning data on an
          &ldquo;as is&rdquo; basis and is not a substitute for your own checks against
          official sources.
        </p>

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-md bg-[#2563EB] px-4 py-2 text-sm font-medium text-white hover:bg-[#1D4ED8] transition-colors disabled:opacity-50"
        >
          {isPending ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <p className="mt-4 text-center text-xs text-[#6B7280]">
        Already have an account?{' '}
        <a href="/login" className="text-[#2563EB] hover:underline">
          Sign in
        </a>
      </p>
    </div>
  )
}
