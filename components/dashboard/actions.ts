'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { lookupPostcode } from '@/lib/postcodes'
import { fetchAndIngestNearby } from '@/lib/ingest/fetchAndIngestNearby'

const MIN_RADIUS_METRES = 250
const MAX_RADIUS_METRES = 5000

export async function addTrackedArea(formData: FormData) {
  const postcode = (formData.get('postcode') as string)?.trim().toUpperCase()
  const label = (formData.get('label') as string)?.trim()

  if (!postcode || !label) {
    return { error: 'Enter a postcode and a label for this territory.' }
  }

  // Basic UK postcode format check before hitting the API.
  const postcodeRegex = /^[A-Z]{1,2}[0-9][0-9A-Z]?\s?[0-9][A-Z]{2}$/
  if (!postcodeRegex.test(postcode)) {
    return { error: 'Please enter a valid UK postcode.' }
  }

  const council = await lookupPostcode(postcode)
  if (!council) {
    return { error: 'Could not identify the planning authority for that postcode. Please check it and try again.' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  // Coverage is now PlanIt-backed (~420 UK authorities), so there's no need to
  // gate on a pre-seeded councils row — auto-provision it instead, matching
  // what the daily ingest cron already does for areas it discovers. Never
  // overwrites an existing row's portal_url (Idox-scraped councils keep theirs).
  const admin = createAdminClient()
  await admin
    .from('councils')
    .upsert(
      { slug: council.slug, name: council.name, supported: true },
      { onConflict: 'slug', ignoreDuplicates: true },
    )

  const { data: inserted, error } = await supabase
    .from('tracked_areas')
    .insert({ user_id: user.id, label, postcode, council_slug: council.slug })
    .select('id, postcode, radius_metres')
    .single()

  if (error || !inserted) {
    return { error: 'Could not add this territory. Please try again.' }
  }

  // Fetch this one area immediately so the dashboard has data now, instead of
  // waiting for tomorrow's 6am ingest run. Best-effort: if PlanIt is briefly
  // unavailable or rate-limited, the area is still added successfully and the
  // next scheduled run will pick it up.
  await fetchAndIngestNearby(admin, inserted.postcode, inserted.radius_metres, council.slug)

  revalidatePath('/dashboard')
  return {}
}

export async function deleteTrackedArea(areaId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  // RLS ensures a user can only delete their own rows, even if they pass
  // someone else's ID. The delete silently does nothing if not authorised.
  const { error } = await supabase
    .from('tracked_areas')
    .delete()
    .eq('id', areaId)
    .eq('user_id', user.id)  // Explicit check as belt-and-braces

  if (error) {
    return { error: 'Could not remove this territory.' }
  }

  revalidatePath('/dashboard')
  return {}
}

// Change the tracking radius for one territory, then re-fetch it from PlanIt
// immediately with the new radius (same best-effort semantics as adding a
// territory) so the change is reflected right away rather than waiting for
// tomorrow's cron run.
export async function updateTrackedAreaRadius(areaId: string, radiusMetres: number) {
  if (!Number.isFinite(radiusMetres) || radiusMetres < MIN_RADIUS_METRES || radiusMetres > MAX_RADIUS_METRES) {
    return { error: `Radius must be between ${MIN_RADIUS_METRES}m and ${MAX_RADIUS_METRES / 1000}km.` }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const { data: updated, error } = await supabase
    .from('tracked_areas')
    .update({ radius_metres: Math.round(radiusMetres) })
    .eq('id', areaId)
    .eq('user_id', user.id)
    .select('postcode, radius_metres, council_slug')
    .single()

  if (error || !updated) {
    return { error: 'Could not update the radius. Please try again.' }
  }

  const admin = createAdminClient()
  await fetchAndIngestNearby(admin, updated.postcode, updated.radius_metres, updated.council_slug)

  revalidatePath('/dashboard')
  revalidatePath(`/dashboard/${areaId}`)
  return {}
}
