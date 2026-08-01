'use client'

// Account type + plan status. The Billing section (Stripe) mounts below this
// with id="billing" — upgrade CTAs elsewhere link to /settings#billing.

import { useState, useTransition } from 'react'
import { switchToProfessional } from './actions'
import type { Profile } from '@/types/database'

function planLabel(profile: Profile): string {
  if (profile.user_type === 'homeowner') return 'Homeowner — free'
  if (profile.subscription_status === 'active') return 'Professional — subscribed'
  if (profile.trial_ends_at) {
    const ms = new Date(profile.trial_ends_at).getTime() - Date.now()
    if (ms > 0) {
      const days = Math.ceil(ms / (24 * 60 * 60 * 1000))
      return `Professional — trial, ${days} day${days === 1 ? '' : 's'} left`
    }
    return 'Professional — trial ended'
  }
  return 'Professional'
}

export default function AccountSection({ profile }: { profile: Profile }) {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSwitch() {
    setError(null)
    startTransition(async () => {
      const result = await switchToProfessional()
      if (result?.error) setError(result.error)
    })
  }

  return (
    <div className="rounded-lg border border-[#D6E4FB] bg-white p-5">
      <h3 className="text-sm font-semibold text-[#202124]">Account</h3>
      <p className="mt-1 text-sm text-[#6B6C70]">{planLabel(profile)}</p>

      {profile.user_type === 'homeowner' && (
        <div className="mt-3">
          <button
            onClick={handleSwitch}
            disabled={isPending}
            className="rounded-md border border-[#2563EB] px-3 py-1.5 text-sm font-medium text-[#2563EB] transition-colors hover:bg-[#2563EB] hover:text-white disabled:opacity-50"
          >
            {isPending ? 'Switching…' : 'Switch to a professional account'}
          </button>
          <p className="mt-2 text-xs leading-relaxed text-[#A0A1A6]">
            Unlocks the pipeline, opportunity tracking and AI outreach for pursuing
            planning-application leads.
            {profile.trial_ends_at === null && ' Includes a 14-day free trial — no card required.'}
          </p>
        </div>
      )}

      {profile.user_type === 'professional' && (
        <p className="mt-2 text-xs text-[#A0A1A6]">
          Want to downgrade to a homeowner account? Contact us and we&rsquo;ll sort it.
        </p>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  )
}
