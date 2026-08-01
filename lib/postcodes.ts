// Shared UK postcode lookup via postcodes.io (free, no key). Used wherever we
// need to resolve a postcode to its council + coordinates — signup-time area
// creation, the territory detail page, and anywhere else that needs this.

import { slugifyAuthority } from '@/lib/planit'

export interface PostcodeInfo {
  name: string // council/admin_district display name, e.g. "Croydon"
  slug: string // slugified, matches councils.slug
  lat: number
  lng: number
}

export async function lookupPostcode(postcode: string): Promise<PostcodeInfo | null> {
  const clean = postcode.replace(/\s+/g, '').toUpperCase()
  try {
    const res = await fetch(`https://api.postcodes.io/postcodes/${clean}`)
    if (!res.ok) return null
    const json = await res.json()
    const name: string = json.result?.admin_district ?? ''
    const lat = json.result?.latitude
    const lng = json.result?.longitude
    if (!name || typeof lat !== 'number' || typeof lng !== 'number') return null
    return { name, slug: slugifyAuthority(name), lat, lng }
  } catch {
    return null
  }
}

// Outward code (postcode district) from a full postcode, e.g. "ST13 5JF" ->
// "st13". Mirrors the regex used by the postcode_district generated column
// (migration 0008) so this always agrees with what seo_locations contains.
export function postcodeDistrict(postcode: string): string | null {
  const compact = postcode.replace(/\s+/g, '').toUpperCase()
  const m = compact.match(/^([A-Z]{1,2}[0-9][A-Z0-9]?)[0-9][A-Z]{2}$/)
  return m ? m[1].toLowerCase() : null
}

// Great-circle distance in kilometres (haversine formula).
export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
