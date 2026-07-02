'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { DigestDay } from '@/types/database'

const VALID_DAYS: DigestDay[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

export async function updateSettings(formData: FormData) {
  const digestDay = formData.get('digest_day') as string

  if (!VALID_DAYS.includes(digestDay as DigestDay)) {
    return { error: 'Invalid digest day.' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const { error } = await supabase
    .from('profiles')
    .update({ digest_day: digestDay })
    .eq('id', user.id)

  if (error) {
    return { error: 'Could not save settings.' }
  }

  revalidatePath('/settings')
  return {}
}

// Switch a homeowner account to professional. Grants the 14-day trial only if
// this account has NEVER had one (trial_ends_at is null) — switching back and
// forth can't reset the clock. Uses the admin client because column-level
// privileges (migration 0006) block user-scoped writes to these columns; the
// session is verified first, so users can still only switch THEMSELVES.
// There is deliberately no professional→homeowner switch (it would orphan a
// live subscription) — that's a support conversation.
export async function switchToProfessional() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('user_type, trial_ends_at')
    .eq('id', user.id)
    .single()

  if (!profile) return { error: 'Could not load your profile.' }
  if (profile.user_type === 'professional') return { error: 'Already a professional account.' }

  const update: { user_type: string; trial_ends_at?: string } = { user_type: 'professional' }
  if (profile.trial_ends_at === null) {
    update.trial_ends_at = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
  }

  const admin = createAdminClient()
  const { error } = await admin.from('profiles').update(update).eq('id', user.id)

  if (error) return { error: 'Could not switch account type.' }

  revalidatePath('/settings')
  revalidatePath('/dashboard')
  return {}
}
