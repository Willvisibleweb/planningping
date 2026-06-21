'use server'

// Server actions for the civils CRM (tracked_leads).
// All actions resolve the current user server-side and rely on RLS — a user can
// only ever read/write their own leads, even if a stale ID is passed.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { PipelineStage } from '@/types/database'
import { PIPELINE_STAGES } from '@/types/database'

// Start tracking an application: copy a display snapshot into tracked_leads at
// stage "Identified". Denormalises council_slug/reference/status so the sync can
// flag changes and the lead survives the council being untracked later.
export async function trackOpportunity(applicationId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  // Read the application (RLS lets the user see apps for councils they track).
  const { data: app, error: appErr } = await supabase
    .from('planning_applications')
    .select('id, council_slug, reference, description, address, status')
    .eq('id', applicationId)
    .single()

  if (appErr || !app) return { error: 'Could not find that application.' }

  const { error } = await supabase.from('tracked_leads').insert({
    user_id: user.id,
    application_id: app.id,
    council_slug: app.council_slug,
    reference: app.reference,
    description: app.description,
    address: app.address,
    cached_status: app.status,
    pipeline_stage: 'Identified',
  })

  // Unique (user_id, application_id) → duplicate means it's already tracked.
  if (error) {
    if (error.code === '23505') return { error: 'Already tracking this application.' }
    return { error: 'Could not track this opportunity.' }
  }

  revalidatePath('/dashboard')
  revalidatePath('/pipeline')
  return {}
}

// Move a lead to a different pipeline stage.
export async function setStage(leadId: string, stage: PipelineStage) {
  if (!PIPELINE_STAGES.includes(stage)) return { error: 'Invalid stage.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const { error } = await supabase
    .from('tracked_leads')
    .update({ pipeline_stage: stage })
    .eq('id', leadId)
    .eq('user_id', user.id)

  if (error) return { error: 'Could not update stage.' }

  revalidatePath('/pipeline')
  return {}
}

// Record that outreach was sent: stamp last_contacted_at, advance an untouched
// "Identified" lead to "Contacted", and clear the priority-follow-up flag.
export async function markAsSent(leadId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const { data: lead } = await supabase
    .from('tracked_leads')
    .select('pipeline_stage')
    .eq('id', leadId)
    .eq('user_id', user.id)
    .single()

  const nextStage = lead?.pipeline_stage === 'Identified' ? 'Contacted' : lead?.pipeline_stage

  const { error } = await supabase
    .from('tracked_leads')
    .update({
      last_contacted_at: new Date().toISOString(),
      priority_follow_up: false,
      pipeline_stage: nextStage,
    })
    .eq('id', leadId)
    .eq('user_id', user.id)

  if (error) return { error: 'Could not mark as sent.' }

  revalidatePath('/pipeline')
  return {}
}

// Stop tracking a lead entirely.
export async function untrackLead(leadId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const { error } = await supabase
    .from('tracked_leads')
    .delete()
    .eq('id', leadId)
    .eq('user_id', user.id)

  if (error) return { error: 'Could not remove lead.' }

  revalidatePath('/pipeline')
  return {}
}
