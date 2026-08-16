// Reading a user's pipeline stages.
//
// Stages are rows now, not a constant — engineering firms run their own process
// and a hardcoded enum meant a migration every time one of them wanted a
// different word. Everything that used to import PIPELINE_STAGES should come
// through here instead.

import { createClient } from '@/lib/supabase/server'
import type { PipelineStageRow } from '@/types/database'

/**
 * A user's stages, in display order. RLS scopes this to the caller, so no
 * user_id filter is needed or wanted — adding one would imply the policy
 * couldn't be trusted.
 */
export async function getUserStages(): Promise<PipelineStageRow[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('pipeline_stages')
    .select('*')
    .order('position', { ascending: true })
  return (data ?? []) as PipelineStageRow[]
}

/** The stage a newly tracked lead lands in — lowest position. */
export function entryStage(stages: PipelineStageRow[]): PipelineStageRow | null {
  return stages[0] ?? null
}

/**
 * Where a lead should move when outreach is logged.
 *
 * This used to be hardcoded as Identified → Contacted, which cannot survive
 * user-defined stages: a firm running New → Qualified → Contacted would have
 * "sent a letter" bump the lead to Qualified, which is wrong and quietly
 * corrupts their pipeline.
 *
 * So: only advance when we can identify a contacted-like stage by name, and
 * only from the entry stage. Anything else returns null and the caller leaves
 * the stage alone — stamping last_contacted_at without guessing is always
 * better than moving a lead somewhere the user didn't mean.
 */
export function contactedStage(
  stages: PipelineStageRow[],
  currentStageId: string | null,
): PipelineStageRow | null {
  const entry = entryStage(stages)
  if (!entry || currentStageId !== entry.id) return null

  const match = stages.find(
    (s) => !s.is_won && !s.is_lost && /contact|approach|outreach/i.test(s.name),
  )
  return match && match.id !== entry.id ? match : null
}
