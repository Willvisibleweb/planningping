// Writing to a lead's activity timeline.
//
// lead_events is append-only (no update or delete policy — see migration 0022),
// so this module only ever inserts. Every meaningful action on a lead should
// leave a trace here: the timeline is the evidence of work done, and a CRM
// whose history has gaps is one nobody trusts.

import { createClient } from '@/lib/supabase/server'
import type { LeadEvent } from '@/types/database'

type EventType = LeadEvent['type']

/**
 * Append one event. Deliberately swallows failures: a lead genuinely moved
 * stage even if we failed to write the note about it, and throwing here would
 * roll back a successful action to preserve a log line. Logged loudly instead
 * so a persistent failure is visible without breaking the product.
 */
export async function logLeadEvent(
  leadId: string,
  userId: string,
  type: EventType,
  body?: string | null,
): Promise<void> {
  try {
    const supabase = await createClient()
    const { error } = await supabase.from('lead_events').insert({
      lead_id: leadId,
      user_id: userId,
      type,
      body: body ?? null,
      created_by: userId,
    })
    if (error) console.error(`lead_events insert failed (${type}):`, error.message)
  } catch (e) {
    console.error(`lead_events insert threw (${type}):`, e)
  }
}

/** A lead's timeline, newest first. RLS scopes it to the caller. */
export async function getLeadTimeline(leadId: string): Promise<LeadEvent[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('lead_events')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
  return (data ?? []) as LeadEvent[]
}
