'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Resolve a UK postcode to its council slug using postcodes.io (free, no key).
// Returns null if the postcode is invalid or the lookup fails.
async function resolveCouncilSlug(postcode: string): Promise<string | null> {
  const clean = postcode.replace(/\s+/g, '').toUpperCase()
  try {
    const res = await fetch(`https://api.postcodes.io/postcodes/${clean}`)
    if (!res.ok) return null
    const json = await res.json()
    // admin_district gives the council name; we slugify it for storage.
    const district: string = json.result?.admin_district ?? ''
    if (!district) return null
    return district.toLowerCase().replace(/[^a-z0-9]+/g, '-')
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

  const councilSlug = await resolveCouncilSlug(postcode)
  if (!councilSlug) {
    return { error: 'Could not identify the council for that postcode. Please check it and try again.' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  // Coverage gate: only allow councils the scraper actually supports. The admin
  // client reads the councils config table (which isn't user-readable via RLS).
  // If the council is missing or unsupported, log the demand as a coverage
  // request (waitlist) instead of letting the user track a dead area.
  const admin = createAdminClient()
  const { data: council } = await admin
    .from('councils')
    .select('supported')
    .eq('slug', councilSlug)
    .maybeSingle()

  if (!council || council.supported !== true) {
    await admin.from('coverage_requests').insert({
      user_id: user.id,
      postcode,
      council_slug: councilSlug,
    })
    const area = councilSlug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    return {
      error: `We don't cover ${area} yet — we've logged your request and will add it as we expand. We'll let you know when it's live.`,
    }
  }

  const { error } = await supabase.from('tracked_areas').insert({
    user_id: user.id,
    label,
    postcode,
    council_slug: councilSlug,
  })

  if (error) {
    return { error: 'Could not add area. Please try again.' }
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
