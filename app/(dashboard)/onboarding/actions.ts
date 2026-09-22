'use server'

// Onboarding writes: what the account sells, its opportunity profile, and its
// first territory.
//
// Kept apart from the dashboard's actions because these run before the user has
// any data, and the failure modes are different — nothing here should ever hard
// fail the user out of setup. The sector step in particular is a preference,
// not a gate: if the write fails, onboarding continues.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { toSectorCode } from '@/lib/sectors'
import {
  SECTOR_OPTIONS,
  SERVICE_OPTIONS,
  SIZE_PRESETS,
  TIMING_CHOICES,
} from '@/lib/opportunities/profileOptions'

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

export interface OnboardingAnswers {
  companyName: string
  services: string[]
  sectors: string[]
  size: string
  timing: string[]
}

const SERVICES = new Set<string>(SERVICE_OPTIONS.map((o) => o.value))
const PROJECT_SECTORS = new Set<string>(SECTOR_OPTIONS.map((o) => o.value))

/**
 * The onboarding answers, written as the account's primary opportunity
 * profile — the same row the settings form edits, so settings open pre-filled
 * and the dashboard ranks against it from the first visit.
 *
 * Every value is checked against the option lists rather than trusted from
 * the browser. Nothing answered means nothing written: an empty profile would
 * make recommendations look personalised when they are not.
 */
export async function saveOnboardingProfile(answers: OnboardingAnswers) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const services = [...new Set((answers.services ?? []).filter((v) => SERVICES.has(v)))]
  const sectors = [...new Set((answers.sectors ?? []).filter((v) => PROJECT_SECTORS.has(v)))]
  const size = SIZE_PRESETS.find((p) => p.value === answers.size) ?? SIZE_PRESETS[0]
  const stages = [...new Set(
    TIMING_CHOICES.filter((c) => (answers.timing ?? []).includes(c.value)).flatMap((c) => [...c.stages]),
  )]
  const name = (answers.companyName ?? '').trim().slice(0, 140)

  if (!name && services.length === 0 && sectors.length === 0 && size.value === 'any' && stages.length === 0) {
    return {}
  }

  const row = {
    user_id: user.id,
    name: name || 'My company',
    is_primary: true,
    profile_kind: 'own_company',
    primary_services: services,
    preferred_sectors: sectors,
    min_residential_units: size.min,
    max_residential_units: size.max,
    preferred_stages: stages,
  }

  const { data: existing } = await supabase
    .from('opportunity_profiles')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_primary', true)
    .maybeSingle()

  const { error } = existing
    ? await supabase.from('opportunity_profiles').update(row).eq('id', existing.id).eq('user_id', user.id)
    : await supabase.from('opportunity_profiles').insert(row)

  // Like the sector, a preference rather than a gate: a failed write is
  // reported but never stops setup.
  if (error) return { error: 'Could not save your answers — you can add them later in Settings.' }

  revalidatePath('/dashboard')
  revalidatePath('/settings')
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
