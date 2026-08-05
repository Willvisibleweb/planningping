'use client'

// Account type + plan status. The Billing section (Stripe) mounts below this
// with id="billing" — upgrade CTAs elsewhere link to /settings#billing.

import { useState, useTransition } from 'react'
import { switchToProfessional } from './actions'
import Button from '@/components/ui/Button'
import { Alert } from '@/components/ui/ErrorState'
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
    <div className="rounded-md border border-border bg-surface p-6 shadow-sm">
      <h3 className="text-sm font-semibold text-ink">Account</h3>
      <p className="mt-1 text-sm text-ink-muted">{planLabel(profile)}</p>

      {profile.user_type === 'homeowner' && (
        <div className="mt-4">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleSwitch}
            loading={isPending}
            loadingLabel="Switching account type"
          >
            Switch to a professional account
          </Button>
          <p className="mt-2.5 text-xs leading-relaxed text-ink-muted">
            Unlocks the pipeline, opportunity tracking and AI outreach for pursuing
            planning-application leads.
            {profile.trial_ends_at === null && ' Includes a 14-day free trial — no card required.'}
          </p>
        </div>
      )}

      {profile.user_type === 'professional' && (
        <p className="mt-2 text-xs text-ink-muted">
          Want to downgrade to a homeowner account? Contact us and we&rsquo;ll sort it.
        </p>
      )}

      {error && (
        <Alert tone="danger" className="mt-4">
          {error}
        </Alert>
      )}
    </div>
  )
}
