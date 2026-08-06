'use server'

// Partnership is written with the service-role client after the session is
// verified here, not straight from the browser.
//
// The authenticated role only holds an UPDATE grant on profiles.digest_day, so
// a direct client write would fail anyway — but routing it through a server
// action is the point: it's the same path switchToProfessional uses, and it
// leaves somewhere to verify a Hub ID against GabrielCAM before trusting it
// without having to change how the client works.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { PARTNERSHIP_PROVIDERS, type PartnershipProvider } from '@/types/database'

const MAX_HUB_ID = 64

export async function setPartnership(formData: FormData) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const raw = formData.get('partnership_provider')
  const rawHubId = (formData.get('partner_hub_id') as string | null)?.trim() || null

  // Whitelist rather than pass through — this value originates in the browser.
  // Anything not on the list is treated as "no partnership" instead of being
  // stored and rejected later by the CHECK constraint.
  const provider: PartnershipProvider | null =
    typeof raw === 'string' && (PARTNERSHIP_PROVIDERS as readonly string[]).includes(raw)
      ? (raw as PartnershipProvider)
      : null

  if (rawHubId && rawHubId.length > MAX_HUB_ID) {
    return { error: `That Hub ID is too long — ${MAX_HUB_ID} characters maximum.` }
  }

  // Only professional accounts can hold a partnership. Checked server-side
  // because the signup form's equivalent check is a client-side convenience.
  const { data: profile } = await supabase
    .from('profiles')
    .select('user_type')
    .eq('id', user.id)
    .single()

  if (provider && profile?.user_type !== 'professional') {
    return {
      error: 'Partner integrations are available on professional accounts. Switch account type first.',
    }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('profiles')
    .update({
      partnership_provider: provider,
      // Clearing the partnership clears the linked ID with it, rather than
      // leaving an orphaned identifier on the row.
      partner_hub_id: provider ? rawHubId : null,
    })
    .eq('id', user.id)

  if (error) return { error: 'Could not save your partner settings. Please try again.' }

  revalidatePath('/settings')
  revalidatePath('/dashboard')
  return {}
}
