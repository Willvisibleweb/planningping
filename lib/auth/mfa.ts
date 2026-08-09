// Two-factor authentication state.
//
// Supabase models MFA as "assurance levels". A session is aal1 after a
// password, and aal2 once a TOTP code has also been accepted. The important
// property is that aal1 with nextLevel aal2 means "this person has 2FA on and
// has NOT completed it yet" — that is the state the dashboard has to block on,
// because the session is otherwise perfectly valid and would sail straight in.
//
// Read helpers only. The mutations live in the settings server actions, where
// they can revalidate.

import { createClient } from '@/lib/supabase/server'

export interface MfaState {
  /** A verified TOTP factor exists on the account. */
  enabled: boolean
  /** Signed in but still owing a code — the dashboard must not render. */
  challengeRequired: boolean
  /** Verified factor id, for unenrolling. */
  factorId: string | null
  /** Enrolment that was started and abandoned — cleaned up on re-enrol. */
  unverifiedFactorIds: string[]
}

const NONE: MfaState = {
  enabled: false,
  challengeRequired: false,
  factorId: null,
  unverifiedFactorIds: [],
}

export async function getMfaState(): Promise<MfaState> {
  const supabase = await createClient()

  const [{ data: factors }, { data: aal }] = await Promise.all([
    supabase.auth.mfa.listFactors(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ])

  // Fails closed on challengeRequired: if we can't read the state we don't
  // claim a challenge is outstanding, because that would lock everyone out of
  // their own dashboard. The password check has already happened either way.
  if (!factors || !aal) return NONE

  const verified = (factors.totp ?? []).filter((f) => f.status === 'verified')
  const unverified = (factors.all ?? []).filter((f) => f.status === 'unverified')

  return {
    enabled: verified.length > 0,
    challengeRequired: aal.currentLevel === 'aal1' && aal.nextLevel === 'aal2',
    factorId: verified[0]?.id ?? null,
    unverifiedFactorIds: unverified.map((f) => f.id),
  }
}
