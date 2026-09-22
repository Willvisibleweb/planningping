import { NextResponse } from 'next/server'
import type { createAdminClient } from '@/lib/supabase/admin'
import { sanitiseError } from '@/lib/reliability/sanitise'

type AdminClient = ReturnType<typeof createAdminClient>

export const PLANIT_PIPELINE_LOCK = 'planit_pipeline'
export const PLANIT_LOCK_TTL_SECONDS = 10 * 60

export interface PipelineLock {
  name: string
  ownerToken: string
  lockedUntil: string
}

export type PipelineLockResult =
  | { acquired: true; lock: PipelineLock }
  | { acquired: false; lockedUntil: string | null; error?: string }

interface LockRpcResponse {
  acquired?: boolean
  name?: string
  owner_token?: string
  locked_until?: string | null
}

export async function acquirePipelineLock(
  db: AdminClient,
  name: string,
  ttlSeconds = PLANIT_LOCK_TTL_SECONDS,
  metadata: Record<string, unknown> = {},
): Promise<PipelineLockResult> {
  try {
    const { data, error } = await db.rpc('acquire_pipeline_lock', {
      p_name: name,
      p_ttl_seconds: ttlSeconds,
      p_metadata: metadata,
    })
    if (error) throw error

    const row = data as LockRpcResponse | null
    if (!row?.acquired) {
      return { acquired: false, lockedUntil: row?.locked_until ?? null }
    }
    if (!row.owner_token || !row.locked_until) {
      return { acquired: false, lockedUntil: null, error: 'Lock RPC returned an incomplete success payload' }
    }
    return {
      acquired: true,
      lock: {
        name: row.name ?? name,
        ownerToken: row.owner_token,
        lockedUntil: row.locked_until,
      },
    }
  } catch (e) {
    const error = sanitiseError(e)
    console.error(JSON.stringify({ at: 'pipelineLock.acquire', name, error }))
    return { acquired: false, lockedUntil: null, error }
  }
}

export async function releasePipelineLock(db: AdminClient, lock: PipelineLock): Promise<void> {
  try {
    const { error } = await db.rpc('release_pipeline_lock', {
      p_name: lock.name,
      p_owner_token: lock.ownerToken,
    })
    if (error) throw error
  } catch (e) {
    console.error(JSON.stringify({ at: 'pipelineLock.release', name: lock.name, error: sanitiseError(e) }))
  }
}

export function lockedPipelineResponse(job: string, lock: Exclude<PipelineLockResult, { acquired: true }>) {
  return NextResponse.json(
    {
      skipped: true,
      job,
      reason: lock.error ? 'pipeline_lock_unavailable' : 'pipeline_lock_held',
      locked_until: lock.lockedUntil,
      error: lock.error,
    },
    { status: 202 },
  )
}
