// Where we are actually holding data, for the national coverage map.
//
// Reads the coverage_points view rather than aggregating here. The first
// version did the grouping in application code and was quietly wrong: the
// client caps a result set at 1000 rows, so it averaged coordinates over an
// arbitrary sample and produced centroids that looked plausible but were not —
// Westminster at 50.71, Southwark at 48.00, which is in France. Aggregating in
// SQL removes the cap and that whole class of bug. See migration 0028.

import { createAdminClient } from '@/lib/supabase/admin'

export interface CoveragePoint {
  name: string
  slug: string
  lat: number
  lng: number
  count: number
}

export async function getCoveragePoints(): Promise<CoveragePoint[]> {
  try {
    const { data } = await createAdminClient()
      .from('coverage_points')
      .select('name, slug, lat, lng, application_count')
      .order('application_count', { ascending: false })

    return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      name: r.name as string,
      slug: r.slug as string,
      // numeric comes back as a string from PostgREST; Number() here rather
      // than at three call sites.
      lat: Number(r.lat),
      lng: Number(r.lng),
      count: Number(r.application_count),
    }))
  } catch {
    return []
  }
}
