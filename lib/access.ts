// Access control — the single source of truth for user-type and plan gating.
//
// Server-side ONLY. UI hiding (nav links, buttons) is cosmetic; every server
// action, page, and API route that exposes a professional feature must call
// hasProAccess() itself. Middleware is fail-open by design (504 hotfix) and
// doesn't even match /leads or /pipeline — enforcement lives here.

import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/types/database'

// cache() dedupes across layout + page within a single render pass, so the
// nav check and the page gate cost one profiles query per request. Server
// actions and route handlers run outside that pass and re-query fresh —
// exactly what we want for enforcement.
export const getProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return (data as Profile) ?? null
})

export function isProfessional(profile: Profile | null): boolean {
  return profile?.user_type === 'professional'
}

// Pro access = professional AND (active subscription OR unexpired trial).
export function hasProAccess(profile: Profile | null): boolean {
  if (!isProfessional(profile)) return false
  if (profile!.subscription_status === 'active') return true
  return !!profile!.trial_ends_at && new Date(profile!.trial_ends_at) > new Date()
}

// Whole days remaining on the trial, for UI copy ("Trial: 9 days left").
// Null when not a professional, never had a trial, or already subscribed.
export function trialDaysLeft(profile: Profile | null): number | null {
  if (!isProfessional(profile)) return null
  if (profile!.subscription_status === 'active') return null
  if (!profile!.trial_ends_at) return null
  const ms = new Date(profile!.trial_ends_at).getTime() - Date.now()
  if (ms <= 0) return 0
  return Math.ceil(ms / (24 * 60 * 60 * 1000))
}
