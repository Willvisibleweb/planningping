'use server'

// Onboarding writes: what the account sells, and its first territory.
//
// Kept apart from the dashboard's actions because these run before the user has
// any data, and the failure modes are different — nothing here should ever hard
// fail the user out of setup. The sector step in particular is a preference,
// not a gate: if the write fails, onboarding continues.

import { createClient } from '@/lib/supabase/server'
import { toSectorCode } from '@/lib/sectors'

export async function saveSector(value: string) {
  const sector = toSectorCode(value)
  if (!sector) return { error: 'Pick one of the options.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  // RLS scopes this to the caller's own row; the explicit id match is
  // belt-and-braces, matching the pattern used everywhere else.
  const { error } = await supabase
    .from('profiles')
    .update({ sector })
    .eq('id', user.id)

  if (error) return { error: 'Could not save that. Try again.' }
  return {}
}

/**
 * Turn a browser geolocation fix into a UK postcode.
 *
 * postcodes.io reverse lookup, the same free service the rest of the app uses
 * for the forward direction. Runs server-side rather than from the browser so
 * the outbound call comes from one place and the client never has to care that
 * postcodes.io exists.
 *
 * Coordinates are validated before use: they arrive from the browser, and a
 * request built from unchecked input is a request built from user input.
 */
export type PostcodeLookup =
  | { ok: true; postcode: string }
  | { ok: false; error: string }

// An explicit discriminant rather than relying on `'error' in result`. TypeScript
// widens each branch of an inferred union with the other's keys as optional, so
// the `in` check does not actually narrow and the success branch still reads as
// possibly-undefined. A literal `ok` flag discriminates properly.
export async function postcodeFromCoords(lat: number, lng: number): Promise<PostcodeLookup> {
  if (
    !Number.isFinite(lat) || !Number.isFinite(lng) ||
    lat < 49 || lat > 61 || lng < -9 || lng > 2
  ) {
    // The bounds are the UK plus a margin. Outside them postcodes.io has
    // nothing to say, and telling the user that is more useful than an empty
    // result they cannot interpret.
    return { ok: false, error: 'That location is outside the UK.' }
  }

  try {
    const res = await fetch(
      `https://api.postcodes.io/postcodes?lon=${lng}&lat=${lat}&limit=1&radius=2000`,
      { signal: AbortSignal.timeout(8000) },
    )
    if (!res.ok) return { ok: false, error: 'Could not look that up. Enter a postcode instead.' }

    const json = await res.json()
    const postcode: string | undefined = json?.result?.[0]?.postcode
    if (!postcode) {
      return { ok: false, error: 'No postcode found near you. Enter one instead.' }
    }
    return { ok: true, postcode }
  } catch {
    return { ok: false, error: 'Could not reach the postcode service. Enter one instead.' }
  }
}
