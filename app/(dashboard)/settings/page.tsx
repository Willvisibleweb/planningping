import { createClient } from '@/lib/supabase/server'
import SettingsForm from './SettingsForm'
import DigestHistory from './DigestHistory'
import AccountSection from './AccountSection'
import BillingSection from './BillingSection'
import type { Profile, Digest } from '@/types/database'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: profile }, { data: digests }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user!.id).single(),
    supabase.from('digests').select('*').order('sent_at', { ascending: false }).limit(10),
  ])

  return (
    <div className="space-y-8 max-w-lg">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Settings</h2>
        <p className="text-sm text-gray-500 mt-1">Manage your account and digest preferences.</p>
      </div>
      <AccountSection profile={profile as Profile} />
      {(profile as Profile).user_type === 'professional' && (
        <BillingSection profile={profile as Profile} />
      )}
      <SettingsForm />
      <DigestHistory digests={digests ?? []} />
    </div>
  )
}
