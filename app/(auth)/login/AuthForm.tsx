'use client'

import { useState, useTransition } from 'react'
import { loginWithPassword, loginWithMagicLink } from './actions'

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
      <div className="rounded-lg border border-[#E5E7EB] bg-white p-6 text-center shadow-sm">
        <p className="text-sm text-[#374151]">
          Check your email — we sent a sign-in link.
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

        {mode === 'password' && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="password" className="block text-sm font-medium text-[#374151]">
                Password
              </label>
              <a href="/reset-password" className="text-xs text-[#2563EB] hover:underline">
                Forgot password?
              </a>
            </div>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full rounded-md border border-[#E5E7EB] px-3 py-2 text-sm text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
            />
          </div>
        )}

        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-md bg-[#2563EB] px-4 py-2 text-sm font-medium text-white hover:bg-[#1D4ED8] transition-colors disabled:opacity-50"
        >
          {isPending
            ? 'Signing in…'
            : mode === 'password'
              ? 'Sign in'
              : 'Send magic link'}
        </button>
      </form>

      <div className="mt-4 text-center">
        <button
          onClick={() => { setMode(mode === 'password' ? 'magic' : 'password'); setError(null) }}
          className="text-xs text-[#6B7280] hover:text-[#111827] transition-colors"
        >
          {mode === 'password' ? 'Sign in with magic link instead' : 'Sign in with password instead'}
        </button>
      </div>

      <p className="mt-4 text-center text-xs text-[#6B7280]">
        No account?{' '}
        <a href="/signup" className="text-[#2563EB] hover:underline">
          Sign up
        </a>
      </p>
    </div>
  )
}
