// Bringing a user's tracked areas back in line with what their plan allows.
//
// The limits were only ever checked when an area was created, so they held
// until the moment a plan changed and then never again. A trial ending, a
// cancellation, or a downgrade from top to mid all left every area in place:
// six areas on a one-area free plan, a 5km radius on a 1km cap. The crons make
// no plan check either — they take every is_active row — so those extra areas
// carried on being fetched from PlanIt each morning and emailed each Monday, at
// our cost, for someone paying nothing.
//
// Two decisions worth knowing about:
//
// Oldest first. When areas have to be dropped, the ones kept are those created
// earliest. It is arbitrary but it is predictable, which matters more — the
// alternative (keeping whichever the query happened to return first) means a
// user can lose a different area on each run.
//
// Deactivate, never delete. is_active is set to false and the row stays. That
// is safe to reverse, and it is unambiguous: deleteTrackedArea removes the row
// outright, so nothing else in the product ever sets is_active = false. A
// deactivated area therefore means "suspended by plan limit" and nothing else,
// which is what lets restore() below put them back without guessing.

import { effectiveTier, planLimits } from '@/lib/access'
import type { Profile } from '@/types/database'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface LimitReconciliation {
  userId: string
  tier: string
  suspended: string[]
  restored: string[]
  radiusClamped: { id: string; from: number; to: number }[]
}

interface AreaRow {
  id: string
  is_active: boolean
  radius_metres: number
  created_at: string
}

/**
 * Reconcile one user's areas against their current plan.
 *
 * Runs in both directions: over the cap, the newest areas are suspended; back
 * under it (an upgrade, or areas deleted by hand), previously suspended ones
 * are restored oldest-first. A user who pays after being downgraded gets their
 * territories back without having to re-add them, which is the difference
 * between an enforced limit and a punishment.
 *
 * Requires a service-role client: it writes rows the user themselves is not
 * meant to be able to flip.
 */
export async function enforcePlanLimits(
  admin: SupabaseClient,
  profile: Profile,
): Promise<LimitReconciliation> {
  const tier = effectiveTier(profile)
  const { maxTrackedAreas, maxRadiusMetres } = planLimits(tier)

  const result: LimitReconciliation = {
    userId: profile.id,
    tier,
    suspended: [],
    restored: [],
    radiusClamped: [],
  }

  const { data } = await admin
    .from('tracked_areas')
    .select('id, is_active, radius_metres, created_at')
    .eq('user_id', profile.id)
    .order('created_at', { ascending: true })

  const areas = (data ?? []) as AreaRow[]
  if (areas.length === 0) return result

  // Infinity is a legitimate cap (the top tier), so this has to survive a
  // non-finite number rather than slicing with it.
  const keep = Number.isFinite(maxTrackedAreas)
    ? areas.slice(0, maxTrackedAreas)
    : areas
  const keepIds = new Set(keep.map((a) => a.id))

  const toSuspend = areas.filter((a) => a.is_active && !keepIds.has(a.id))
  const toRestore = areas.filter((a) => !a.is_active && keepIds.has(a.id))

  if (toSuspend.length > 0) {
    await admin
      .from('tracked_areas')
      .update({ is_active: false })
      .in('id', toSuspend.map((a) => a.id))
    result.suspended = toSuspend.map((a) => a.id)
  }

  if (toRestore.length > 0) {
    await admin
      .from('tracked_areas')
      .update({ is_active: true })
      .in('id', toRestore.map((a) => a.id))
    result.restored = toRestore.map((a) => a.id)
  }

  // Radius is capped separately, and only on the areas being kept — there is no
  // point rewriting one that is suspended, and leaving it means the original
  // value is still there if the user upgrades again. RadiusControl already
  // clamps in the UI, but only when someone opens that page and saves; the
  // ingest reads the stored value, so an unclamped 5km on a 1km plan was really
  // being fetched at 5km.
  for (const area of keep) {
    if (area.radius_metres > maxRadiusMetres) {
      await admin
        .from('tracked_areas')
        .update({ radius_metres: maxRadiusMetres })
        .eq('id', area.id)
      result.radiusClamped.push({
        id: area.id,
        from: area.radius_metres,
        to: maxRadiusMetres,
      })
    }
  }

  return result
}

/**
 * Reconcile every user who has at least one area.
 *
 * Called at the top of the ingest cron, before anything is fetched — enforcing
 * after the fetch would mean paying for the data first and then deciding the
 * user was not entitled to it.
 */
export async function enforcePlanLimitsForAll(
  admin: SupabaseClient,
): Promise<LimitReconciliation[]> {
  const { data: userIds } = await admin
    .from('tracked_areas')
    .select('user_id')

  const unique = [...new Set(((userIds ?? []) as { user_id: string }[]).map((r) => r.user_id))]
  if (unique.length === 0) return []

  const { data: profiles } = await admin
    .from('profiles')
    .select('*')
    .in('id', unique)

  const results: LimitReconciliation[] = []
  for (const profile of (profiles ?? []) as Profile[]) {
    const r = await enforcePlanLimits(admin, profile)
    if (r.suspended.length || r.restored.length || r.radiusClamped.length) {
      results.push(r)
    }
  }
  return results
}
