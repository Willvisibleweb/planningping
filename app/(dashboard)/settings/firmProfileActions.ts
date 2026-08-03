'use server'

// Firm letterhead identity (business name/address/phone/logo) used by the
// formal-letter outreach mode. Own file, not folded into ./actions.ts —
// those actions exist specifically to route around profiles' column-level
// lock (migration 0006) via the admin client. firm_profiles has normal RLS
// and never needs admin escalation; keeping them apart keeps "admin client =
// deliberate RLS bypass" a clean signal in this codebase.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

const MAX_LOGO_BYTES = 1024 * 1024 // 1MB — mirrors the bucket's own limit (defense in depth)
const ALLOWED_LOGO_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
}

export async function saveFirmProfile(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const businessName = (formData.get('businessName') as string)?.trim() || null
  const address = (formData.get('address') as string)?.trim() || null
  const phone = (formData.get('phone') as string)?.trim() || null
  const contactEmail = (formData.get('contactEmail') as string)?.trim() || null

  const { error } = await supabase
    .from('firm_profiles')
    .upsert(
      { user_id: user.id, business_name: businessName, address, phone, contact_email: contactEmail },
      { onConflict: 'user_id' },
    )

  if (error) return { error: 'Could not save your firm details. Please try again.' }

  revalidatePath('/settings')
  return {}
}

export async function uploadFirmLogo(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const file = formData.get('logo') as File | null
  if (!file || file.size === 0) return { error: 'Choose a logo file.' }
  if (file.size > MAX_LOGO_BYTES) return { error: 'Logo must be under 1MB.' }
  const ext = ALLOWED_LOGO_TYPES[file.type]
  if (!ext) return { error: 'Logo must be a PNG or JPEG image.' }

  // Delete any existing logo first (regardless of its extension) so a
  // png<->jpg re-upload never leaves an orphaned object behind.
  const { data: existing } = await supabase.storage.from('firm-logos').list(user.id)
  if (existing && existing.length > 0) {
    await supabase.storage.from('firm-logos').remove(existing.map((f) => `${user.id}/${f.name}`))
  }

  const path = `${user.id}/logo.${ext}`
  const { error: uploadError } = await supabase.storage
    .from('firm-logos')
    .upload(path, file, { contentType: file.type, upsert: true })
  if (uploadError) return { error: 'Could not upload the logo. Please try again.' }

  const { error: dbError } = await supabase
    .from('firm_profiles')
    .upsert({ user_id: user.id, logo_path: path }, { onConflict: 'user_id' })
  if (dbError) return { error: 'Logo uploaded, but could not save it to your profile. Please try again.' }

  revalidatePath('/settings')
  return {}
}

export async function removeFirmLogo() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const { data: existing } = await supabase.storage.from('firm-logos').list(user.id)
  if (existing && existing.length > 0) {
    await supabase.storage.from('firm-logos').remove(existing.map((f) => `${user.id}/${f.name}`))
  }

  const { error } = await supabase
    .from('firm_profiles')
    .update({ logo_path: null })
    .eq('user_id', user.id)
  if (error) return { error: 'Could not remove the logo. Please try again.' }

  revalidatePath('/settings')
  return {}
}
