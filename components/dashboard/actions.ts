'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchNearby, slugifyAuthority } from '@/lib/planit'
import { upsertApplications, type IngestApplication } from '@/lib/ingest/upsertApplications'

const INGEST_RECENT_DAYS = 30
const INGEST_MIN_RADIUS_KM = 0.5

// Resolve a UK postcode to its council name + slug using postcodes.io (free,
// no key). Returns null if the postcode is invalid or the lookup fails.
async function resolveCouncil(postcode: string): Promise<{ name: string; slug: string } | null> {
  const clean = postcode.replace(/\s+/g, '').toUpperCase()
  try {
    const res = await fetch(`https://api.postcodes.io/postcodes/${clean}`)
    if (!res.ok) return null
    const json = await res.json()
    // admin_district gives the council name.
    const name: string = json.result?.admin_district ?? ''
    if (!name) return null
    return { name, slug: slugifyAuthority(name) }
  } catch {
    return null
  }
}

export async function addTrackedArea(formData: FormData) {
  const postcode = (formData.get('postcode') as string)?.trim().toUpperCase()
  const label = (formData.get('label') as string)?.trim()

  if (!postcode || !label) {
    return { error: 'Postcode and label are required.' }
  }

  // Basic UK postcode format check before hitting the API.
  const postcodeRegex = /^[A-Z]{1,2}[0-9][0-9A-Z]?\s?[0-9][A-Z]{2}$/
  if (!postcodeRegex.test(postcode)) {
    return { error: 'Please enter a valid UK postcode.' }
  }

  const council = await resolveCouncil(postcode)
  if (!council) {
    return { error: 'Could not identify the council for that postcode. Please check it and try again.' }
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
    .select('postcode, radius_metres')
    .single()

  if (error || !inserted) {
    return { error: 'Could not add area. Please try again.' }
  }

  // Fetch this one area immediately so the dashboard has data now, instead of
  // waiting for tomorrow's 6am ingest run. Best-effort: if PlanIt is briefly
  // unavailable or rate-limited, the area is still added successfully and the
  // next scheduled run will pick it up.
  try {
    const radiusKm = Math.max(inserted.radius_metres / 1000, INGEST_MIN_RADIUS_KM)
    const nearby = await fetchNearby({
      postcode: inserted.postcode,
      radiusKm,
      recentDays: INGEST_RECENT_DAYS,
    })

    // A radius search can surface neighbouring authorities beyond the
    // requested council (e.g. near a border) — provision those too, not just
    // the primary one, so their rows aren't orphaned until tomorrow's cron.
    const otherCouncils = [...new Set(nearby.map((a) => a.councilName))].filter(
      (n) => slugifyAuthority(n) !== council.slug,
    )
    if (otherCouncils.length > 0) {
      await admin.from('councils').upsert(
        otherCouncils.map((name) => ({ slug: slugifyAuthority(name), name, supported: true })),
        { onConflict: 'slug', ignoreDuplicates: true },
      )
    }

    const toIngest: IngestApplication[] = nearby.map((app) => ({
      council_slug: slugifyAuthority(app.councilName),
      reference: app.reference,
      address: app.address,
      description: app.description,
      status: app.status,
      application_date: app.applicationDate,
      decision_date: app.decisionDate,
      raw_data: { source: 'planit', url: app.url, app_type: app.appType, lat: app.lat, lng: app.lng },
    }))
    if (toIngest.length > 0) await upsertApplications(admin, toIngest)
  } catch (e) {
    console.error('Immediate PlanIt fetch failed for new area (non-fatal):', e)
  }

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
    return { error: 'Could not remove area.' }
  }

  revalidatePath('/dashboard')
  return {}
}
