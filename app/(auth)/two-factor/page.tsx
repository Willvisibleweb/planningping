// The code screen shown between password and dashboard.
//
// Deliberately in the (auth) group, not (dashboard). The dashboard layout
// redirects here whenever a session still owes a code — if this page lived
// inside that layout it would redirect to itself forever.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getMfaState } from '@/lib/auth/mfa'
import TwoFactorChallengeForm from './TwoFactorChallengeForm'

export const metadata = { title: 'Two-step verification | PlanningPing' }

export default async function TwoFactorPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // No password yet — this screen is meaningless on its own.
  if (!user) redirect('/login')

  const state = await getMfaState()

  // Already satisfied (or never had 2FA on). Landing here would strand someone
  // on a form they cannot complete.
  if (!state.challengeRequired) redirect('/dashboard')

  return (
    <div className="w-full max-w-sm">
      <TwoFactorChallengeForm />
    </div>
  )
}
