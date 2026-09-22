'use server'

// Duplicate review. Admin-only, and it only ever changes the review status —
// resolving a pair as a confirmed duplicate records the judgement; it does not
// delete or merge either application. That stays a deliberate manual step.

import { revalidatePath } from 'next/cache'
import { getProfile } from '@/lib/access'
import { isAdmin } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

const VERDICTS = new Set(['confirmed_duplicate', 'not_duplicate'])
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function reviewDuplicateCandidate(formData: FormData): Promise<void> {
  const profile = await getProfile()
  if (!isAdmin(profile)) return

  const id = String(formData.get('id') ?? '')
  const verdict = String(formData.get('verdict') ?? '')
  if (!UUID.test(id) || !VERDICTS.has(verdict)) return

  await createAdminClient()
    .from('duplicate_candidates')
    .update({ status: verdict, reviewed_at: new Date().toISOString(), reviewed_by: profile!.email })
    .eq('id', id)
    .eq('status', 'open')

  revalidatePath('/admin/data-health')
}
