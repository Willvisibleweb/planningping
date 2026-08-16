'use server'

// Server actions for the civils CRM (tracked_leads).
// All actions resolve the current user server-side and rely on RLS — a user can
// only ever read/write their own leads, even if a stale ID is passed.
//
// Stages are rows in pipeline_stages now, not a hardcoded enum, so every action
// resolves them per user. Every action that changes a lead also appends to
// lead_events: the timeline is the evidence of work done, and a CRM whose
// history has gaps is one nobody trusts.
//
// During the transition these still write the legacy pipeline_stage text column
// alongside stage_id, so a rollback to the previous deploy finds correct data.
// Both the dual-write and the column go in the migration that drops it.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getProfile, hasProAccess } from '@/lib/access'
import { getUserStages, entryStage, contactedStage } from '@/lib/pipeline/stages'
import { logLeadEvent, getLeadTimeline } from '@/lib/pipeline/events'
import type { LeadEvent } from '@/types/database'

// The pipeline is a professional feature. UI hiding is cosmetic — these
// server actions are the enforcement point. (untrackLead stays ungated so a
// lapsed professional can still clean up their data.)
const PRO_REQUIRED = 'This feature requires an active professional plan.'

function revalidatePipeline() {
  revalidatePath('/dashboard')
  revalidatePath('/pipeline')
  revalidatePath('/leads')
}

// Start tracking an application: copy a display snapshot into tracked_leads at
// the user's entry stage. Denormalises council_slug/reference/status so the
// sync can flag changes and the lead survives the council being untracked.
export async function trackOpportunity(applicationId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }
  if (!hasProAccess(await getProfile())) return { error: PRO_REQUIRED }

  // Read the application (RLS lets the user see apps for councils they track).
  const { data: app, error: appErr } = await supabase
    .from('planning_applications')
    .select('id, council_slug, reference, description, address, status, score')
    .eq('id', applicationId)
    .single()

  if (appErr || !app) return { error: 'Could not find that application.' }

  const stages = await getUserStages()
  const entry = entryStage(stages)
  if (!entry) return { error: 'No pipeline stages configured. Add one in Settings.' }

  const { data: inserted, error } = await supabase
    .from('tracked_leads')
    .insert({
      user_id: user.id,
      application_id: app.id,
      council_slug: app.council_slug,
      reference: app.reference,
      description: app.description,
      address: app.address,
      cached_status: app.status,
      stage_id: entry.id,
      // Snapshot, not a live mirror: applications are re-scored as rules
      // change, and the difference between then and now is a signal.
      score_at_add: app.score,
      pipeline_stage: 'Identified', // legacy column, see file header
    })
    .select('id')
    .single()

  // Unique (user_id, application_id) → duplicate means it's already tracked.
  if (error) {
    if (error.code === '23505') return { error: 'Already tracking this application.' }
    return { error: 'Could not track this opportunity.' }
  }

  if (inserted) {
    await logLeadEvent(inserted.id, user.id, 'created', `Added to pipeline at ${entry.name}`)
  }

  revalidatePipeline()
  return {}
}

// Move a lead to a different stage.
export async function setStage(leadId: string, stageId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }
  if (!hasProAccess(await getProfile())) return { error: PRO_REQUIRED }

  // Validate against the user's OWN stages. RLS already prevents reading
  // someone else's, so a stage id that isn't in this list is either stale or
  // forged — either way it must not be written.
  const stages = await getUserStages()
  const target = stages.find((s) => s.id === stageId)
  if (!target) return { error: 'Unknown pipeline stage.' }

  const { data: current } = await supabase
    .from('tracked_leads')
    .select('stage_id')
    .eq('id', leadId)
    .eq('user_id', user.id)
    .single()

  if (current?.stage_id === target.id) return {} // no-op, don't log a non-event

  const from = stages.find((s) => s.id === current?.stage_id)

  const { error } = await supabase
    .from('tracked_leads')
    .update({ stage_id: target.id, pipeline_stage: target.name })
    .eq('id', leadId)
    .eq('user_id', user.id)

  if (error) return { error: 'Could not update stage.' }

  await logLeadEvent(
    leadId,
    user.id,
    'stage_change',
    from ? `${from.name} → ${target.name}` : `Moved to ${target.name}`,
  )

  revalidatePipeline()
  return {}
}

// Record that outreach was sent: stamp last_contacted_at, clear the
// priority-follow-up flag, and advance the stage only when we can do so safely
// (see contactedStage — guessing on a custom pipeline is worse than not moving).
export async function markAsSent(leadId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }
  if (!hasProAccess(await getProfile())) return { error: PRO_REQUIRED }

  const { data: lead } = await supabase
    .from('tracked_leads')
    .select('stage_id')
    .eq('id', leadId)
    .eq('user_id', user.id)
    .single()

  const stages = await getUserStages()
  const next = contactedStage(stages, lead?.stage_id ?? null)

  const patch: Record<string, unknown> = {
    last_contacted_at: new Date().toISOString(),
    priority_follow_up: false,
  }
  if (next) {
    patch.stage_id = next.id
    patch.pipeline_stage = next.name
  }

  const { error } = await supabase
    .from('tracked_leads')
    .update(patch)
    .eq('id', leadId)
    .eq('user_id', user.id)

  if (error) return { error: 'Could not mark as sent.' }

  await logLeadEvent(leadId, user.id, 'email_logged', 'Outreach marked as sent')
  if (next) {
    await logLeadEvent(leadId, user.id, 'stage_change', `Moved to ${next.name} after outreach`)
  }

  revalidatePipeline()
  return {}
}

export interface LeadDetail {
  timeline: LeadEvent[]
  /** Live figures from planning_applications, not the snapshot on the lead. */
  score: number | null
  band: 'HOT' | 'WARM' | 'COLD' | null
  reasons: string[] | null
  /**
   * Whether the underlying application could be read at all.
   *
   * Leads outlive the areas that found them — untracking a council keeps the
   * lead but revokes read access to its application (the RLS policy requires an
   * active tracked_area for that council). Without this flag a null score is
   * ambiguous, and the panel would report "not scored yet" for a lead that
   * scored 58 — which is a lie the user can disprove from their own board.
   */
  applicationVisible: boolean
}

/**
 * Everything the detail panel shows, in one round trip.
 *
 * Fetched on open rather than with the board: a pipeline of 60 leads would
 * otherwise pull 60 timelines to render 60 cards that show none of it. The
 * panel is opened one lead at a time, so the data should be too.
 */
export async function getLeadDetail(leadId: string): Promise<LeadDetail | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  // Ownership check before anything else. RLS would scope both queries below
  // anyway, but failing here returns an honest "not found" instead of a panel
  // rendering an empty timeline for a lead that isn't the caller's.
  const { data: lead } = await supabase
    .from('tracked_leads')
    .select('application_id')
    .eq('id', leadId)
    .eq('user_id', user.id)
    .single()
  if (!lead) return { error: 'Could not find that lead.' }

  const [timeline, { data: app }] = await Promise.all([
    getLeadTimeline(leadId),
    supabase
      .from('planning_applications')
      .select('score, band, score_reasons')
      .eq('id', lead.application_id)
      .single(),
  ])

  return {
    timeline,
    score: app?.score ?? null,
    band: app?.band ?? null,
    reasons: app?.score_reasons ?? null,
    applicationVisible: !!app,
  }
}

/** Add a free-text note to the timeline. */
export async function addLeadNote(leadId: string, body: string) {
  const trimmed = body.trim()
  if (!trimmed) return { error: 'Write something first.' }
  if (trimmed.length > 2000) return { error: 'Notes are limited to 2000 characters.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }
  if (!hasProAccess(await getProfile())) return { error: PRO_REQUIRED }

  // Confirm the lead is the caller's before writing an event against it. RLS
  // would block the insert anyway (user_id is the caller's), but without this
  // a forged id would create an orphan event pointing at someone else's lead.
  const { data: lead } = await supabase
    .from('tracked_leads')
    .select('id')
    .eq('id', leadId)
    .eq('user_id', user.id)
    .single()
  if (!lead) return { error: 'Could not find that lead.' }

  await logLeadEvent(leadId, user.id, 'note', trimmed)

  revalidatePipeline()
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

  // No event logged: lead_events cascades on delete, so there is nothing left
  // to attach it to.
  revalidatePipeline()
  return {}
}
