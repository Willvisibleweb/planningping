'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
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
