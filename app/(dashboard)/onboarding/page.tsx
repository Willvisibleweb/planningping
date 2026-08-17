// First-run setup.
//
// Guarded rather than decorative: anyone who already has a territory is sent
// straight to the dashboard, so this cannot be reached by an established
// account typing the URL, and cannot trap someone who has already finished.
// Sector alone is not the test — a user who picked a sector and then skipped
// the postcode step should still be offered it next time, and an account that
// predates onboarding has no sector but plenty of territories.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/access'
import OnboardingFlow from './OnboardingFlow'

export const metadata = {
  title: 'Set up your account — PlanningPing',
  robots: { index: false, follow: false },
}

export default async function OnboardingPage() {
  const profile = await getProfile()
  if (!profile) redirect('/login')

  const supabase = await createClient()
  const { count } = await supabase
    .from('tracked_areas')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', profile.id)

  if ((count ?? 0) > 0) redirect('/dashboard')

  return (
    <div className="py-6 sm:py-10">
      <OnboardingFlow />
    </div>
  )
}
