'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { lookupPostcode } from '@/lib/postcodes'
import { fetchAndIngestNearby } from '@/lib/ingest/fetchAndIngestNearby'
import { getProfile, hasProAccess, maxRadiusMetres as getMaxRadiusMetres, maxTrackedAreas } from '@/lib/access'
import type { MinBand } from '@/types/database'

const VALID_MIN_BANDS: MinBand[] = ['ALL', 'WARM_PLUS', 'HOT_ONLY']

const MIN_RADIUS_METRES = 250

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

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  // Check the tier's area cap before the postcode lookup (external API call)
  // so an over-cap request fails fast.
  const profile = await getProfile()
  const max = maxTrackedAreas(profile)
  const { count } = await supabase
    .from('tracked_areas')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('is_active', true)
  if ((count ?? 0) >= max) {
    return {
      error: `Your plan supports up to ${max} tracked area${max === 1 ? '' : 's'} — you have ${count}. Remove one, or upgrade for more.`,
    }
  }

  const council = await lookupPostcode(postcode)
  if (!council) {
    return { error: 'Could not identify the planning authority for that postcode. Please check it and try again.' }
  }

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

  // Optional first-territory settings from onboarding. Each is validated and
  // only applied when supplied, so every other caller keeps the defaults.
  const optional: Record<string, unknown> = {}
  const radiusRaw = Number(formData.get('radius_metres'))
  if (formData.get('radius_metres') !== null && Number.isFinite(radiusRaw)) {
    optional.radius_metres = Math.round(Math.min(Math.max(radiusRaw, MIN_RADIUS_METRES), getMaxRadiusMetres(profile)))
  }
  const minBand = formData.get('min_band') as MinBand | null
  if (minBand && VALID_MIN_BANDS.includes(minBand)) optional.min_band = minBand
  if (formData.get('alerts_enabled') !== null) {
    // Alerts are professional-only, re-checked here rather than trusted.
    optional.alerts_enabled = formData.get('alerts_enabled') === 'true' && hasProAccess(profile)
  }

  const { data: inserted, error } = await supabase
    .from('tracked_areas')
    .insert({ user_id: user.id, label, postcode, council_slug: council.slug, ...optional })
    .select('id, postcode, radius_metres')
    .single()

  if (error || !inserted) {
    return { error: 'Could not add this territory. Please try again.' }
  }

  // Fetch this area from PlanIt, but do not make the person wait for it.
  //
  // One PlanIt query averages 18.6 seconds and has taken 63; with retries the
  // worst case is close to two minutes. Awaiting it here meant the Add
  // Territory button sat spinning for all of that before the page moved.
  //
  // `after` runs this once the response has been sent, so the territory is
  // added instantly and the fetch still happens immediately — not on the next
  // cron tick. The dashboard is scoped by council, so a council the national
  // backfill has already covered shows applications straight away; this fills
  // in whatever is newest for their specific postcode and radius.
  after(async () => {
    const firstFetch = await fetchAndIngestNearby(
      admin, inserted.postcode, inserted.radius_metres, council.slug,
    )

    // Stamp the AREA, not just the council.
    //
    // fetchAndIngestNearby stamps councils.last_planit_fetch_at — but
    // tracked_areas.last_planit_fetch_at is only ever written by the ingest
    // cron. So an area added here was genuinely fetched and still read as
    // never-fetched everywhere else, including the freshness check, which then
    // told the user the ingest had never run.
    //
    // Returns null on failure and { skipped: true } when this exact source was
    // fetched recently enough to reuse; both mean this area's own data is
    // current, so only an outright failure leaves the stamp unset for the cron.
    if (firstFetch) {
      await admin
        .from('tracked_areas')
        .update({ last_planit_fetch_at: new Date().toISOString() })
        .eq('id', inserted.id)
    }

    // Second revalidate: the first one fires before this fetch has finished,
    // so without it the applications we just stored would not appear until the
    // next natural revalidation.
    revalidatePath('/dashboard')
  })

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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const maxRadius = getMaxRadiusMetres(await getProfile())
  if (!Number.isFinite(radiusMetres) || radiusMetres < MIN_RADIUS_METRES || radiusMetres > maxRadius) {
    return { error: `Your plan supports up to ${maxRadius / 1000}km (minimum ${MIN_RADIUS_METRES}m).` }
  }

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

  // Same reasoning as addTrackedArea: the new radius is saved and the page
  // moves immediately, while the re-fetch it triggers runs after the response.
  // A widened radius otherwise held the person on a spinner for the length of
  // a PlanIt round trip.
  after(async () => {
    const refreshed = await fetchAndIngestNearby(admin, updated.postcode, updated.radius_metres, updated.council_slug)
    if (refreshed) {
      await admin
        .from('tracked_areas')
        .update({ last_planit_fetch_at: new Date().toISOString() })
        .eq('id', areaId)
    }
    revalidatePath('/dashboard')
    revalidatePath(`/dashboard/${areaId}`)
  })

  revalidatePath('/dashboard')
  revalidatePath(`/dashboard/${areaId}`)
  return {}
}

// Relevance filter (min_band) and email-alert opt-in for one territory. No
// PlanIt re-fetch here (unlike radius) — this only changes what's shown /
// alerted on, not what's fetched.
export async function updateTrackedAreaSettings(
  areaId: string,
  settings: { minBand: MinBand; alertsEnabled: boolean },
) {
  if (!VALID_MIN_BANDS.includes(settings.minBand)) {
    return { error: 'Invalid relevance filter.' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  // Defense in depth: alerts are a professional-tier feature. The UI already
  // hides/disables the toggle for non-pro accounts, but a direct call must be
  // re-checked server-side rather than trusting the client — same pattern as
  // app/api/outreach/route.ts's server-side hasProAccess() re-check.
  const alertsEnabled = settings.alertsEnabled && hasProAccess(await getProfile())

  const { error } = await supabase
    .from('tracked_areas')
    .update({ min_band: settings.minBand, alerts_enabled: alertsEnabled })
    .eq('id', areaId)
    .eq('user_id', user.id)

  if (error) {
    return { error: 'Could not update territory settings. Please try again.' }
  }

  revalidatePath('/dashboard')
  revalidatePath(`/dashboard/${areaId}`)
  return {}
}
