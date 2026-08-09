import { createClient } from '@/lib/supabase/server'
import { getMfaState } from '@/lib/auth/mfa'
import SettingsForm from './SettingsForm'
import DigestHistory from './DigestHistory'
import AccountSection from './AccountSection'
import BillingSection from './BillingSection'
import FirmProfileSection from './FirmProfileSection'
import PartnershipSection from './PartnershipSection'
import TwoFactorSection from './TwoFactorSection'
import type { Profile, FirmProfile } from '@/types/database'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: profile }, { data: digests }, { data: firmProfile }, mfa] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user!.id).single(),
    supabase.from('digests').select('*').order('sent_at', { ascending: false }).limit(10),
    supabase.from('firm_profiles').select('*').eq('user_id', user!.id).maybeSingle(),
    getMfaState(),
  ])

  // Bucket is private (RLS-scoped, never a public URL) — base64-inline the
  // logo server-side for this one small settings-page thumbnail rather than
  // introducing signed-URL infrastructure for it.
  let logoDataUri: string | null = null
  const firm = firmProfile as FirmProfile | null
  if (firm?.logo_path) {
    const { data: blob } = await supabase.storage.from('firm-logos').download(firm.logo_path)
    if (blob) {
      const mime = firm.logo_path.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg'
      const base64 = Buffer.from(await blob.arrayBuffer()).toString('base64')
      logoDataUri = `data:${mime};base64,${base64}`
    }
  }

  return (
    <div className="pp-stagger max-w-lg space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-ink">Settings</h2>
        <p className="text-sm text-ink-muted mt-1">Manage your account and digest preferences.</p>
      </div>
      <AccountSection profile={profile as Profile} />
      {(profile as Profile).user_type === 'professional' && (
        <>
          <BillingSection profile={profile as Profile} />
          <FirmProfileSection firmProfile={firm} logoDataUri={logoDataUri} />
          {/* Professional-only: this is where an existing account opts into a
              partner integration, since the signup question only ever reaches
              new sign-ups. */}
          <PartnershipSection profile={profile as Profile} />
        </>
      )}
      <TwoFactorSection enabled={mfa.enabled} />
      <SettingsForm />
      <DigestHistory digests={digests ?? []} />
    </div>
  )
}
