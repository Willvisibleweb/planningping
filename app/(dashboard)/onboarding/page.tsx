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
import { getProfile, hasProAccess, maxRadiusMetres } from '@/lib/access'
import OnboardingFlow from './OnboardingFlow'
import OnboardingUpgradeModal from './OnboardingUpgradeModal'
import type { OpportunityProfile } from '@/types/database'

type OnboardingProfileSeed = Pick<
  OpportunityProfile,
  'name' | 'primary_services' | 'preferred_sectors' | 'min_residential_units' | 'max_residential_units' | 'preferred_stages'
>

export const metadata = {
  title: 'Set up your account — PlanningPing',
  robots: { index: false, follow: false },
}

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string | string[] }>
}) {
  const showUpgradeCta = (await searchParams).welcome === '1'
  const profile = await getProfile()
  if (!profile) redirect('/login')

  const supabase = await createClient()
  const { count } = await supabase
    .from('tracked_areas')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', profile.id)

  if ((count ?? 0) > 0) redirect('/dashboard')

  // Someone who left part-way through comes back to their earlier answers.
  const { data: existing } = await supabase
    .from('opportunity_profiles')
    .select('name, primary_services, preferred_sectors, min_residential_units, max_residential_units, preferred_stages')
    .eq('is_primary', true)
    .maybeSingle()

  return (
    <div className="py-6 sm:py-10">
      <OnboardingUpgradeModal show={showUpgradeCta} />
      <OnboardingFlow
        initialSector={profile.sector ?? null}
        initialProfile={(existing as OnboardingProfileSeed | null) ?? null}
        maxRadiusMetres={maxRadiusMetres(profile)}
        canAlert={hasProAccess(profile)}
      />
    </div>
  )
}
