'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { OpportunityFeedbackReason, OpportunityFeedbackVerdict } from '@/types/database'

const VERDICTS = new Set<OpportunityFeedbackVerdict>(['good', 'not_relevant'])
const REASONS = new Set<OpportunityFeedbackReason>([
  'too_small',
  'too_large',
  'wrong_sector',
  'wrong_location',
  'wrong_project_type',
  'too_early',
  'too_late',
  'not_a_service',
  'other',
])

export async function saveOpportunityFeedback(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const applicationId = typeof formData.get('applicationId') === 'string'
    ? String(formData.get('applicationId'))
    : ''
  const profileId = typeof formData.get('profileId') === 'string' && formData.get('profileId')
    ? String(formData.get('profileId'))
    : null
  const verdict = formData.get('verdict') as OpportunityFeedbackVerdict | null
  const reason = formData.get('reason') as OpportunityFeedbackReason | null
  const note = typeof formData.get('note') === 'string'
    ? String(formData.get('note')).trim().slice(0, 1000) || null
    : null

  if (!applicationId || !verdict || !VERDICTS.has(verdict)) {
    return { error: 'Choose feedback for this opportunity.' }
  }
  if (reason && !REASONS.has(reason)) return { error: 'Unknown feedback reason.' }

  const { data: app } = await supabase
    .from('planning_applications')
    .select('id')
    .eq('id', applicationId)
    .maybeSingle()
  if (!app) return { error: 'Could not find that opportunity.' }

  if (profileId) {
    const { data: profile } = await supabase
      .from('opportunity_profiles')
      .select('id')
      .eq('id', profileId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!profile) return { error: 'Could not find that recommendation profile.' }
  }

  const lookup = supabase
    .from('opportunity_feedback')
    .select('id')
    .eq('user_id', user.id)
    .eq('application_id', applicationId)

  const { data: existing } = profileId
    ? await lookup.eq('opportunity_profile_id', profileId).maybeSingle()
    : await lookup.is('opportunity_profile_id', null).maybeSingle()

  const row = {
    user_id: user.id,
    application_id: applicationId,
    opportunity_profile_id: profileId,
    verdict,
    reason: verdict === 'not_relevant' ? reason : null,
    note,
  }

  const { error } = existing
    ? await supabase.from('opportunity_feedback').update(row).eq('id', existing.id).eq('user_id', user.id)
    : await supabase.from('opportunity_feedback').insert(row)

  if (error) return { error: 'Could not save your feedback. Please try again.' }

  revalidatePath('/dashboard')
  revalidatePath('/leads')
  revalidatePath(`/applications/${applicationId}`)
  return {}
}
