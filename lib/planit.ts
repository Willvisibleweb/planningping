// PlanIt API client — https://www.planit.org.uk/api/
//
// Free, public, rate-limited aggregator covering ~420 UK planning authorities.
// Replaces the per-council Idox scraping: one clean HTTP call instead of a
// fragile portal-by-portal parser. Be polite — handle 429 with backoff.

export interface PlanItApplication {
  reference: string // the council's own reference (PlanIt `uid`; `reference` is usually null)
  councilName: string // PlanIt `area_name`, e.g. "Croydon", "Bristol"
  address: string | null
  description: string | null
  status: string | null // PlanIt `app_state`, e.g. "Undecided", "Conditions", "Approved"
  applicationDate: string | null // YYYY-MM-DD
  decisionDate: string | null
  appType: string | null // PlanIt classification, e.g. "Trees", "Full", "Heritage"
  url: string | null // deep link straight to the council's application page
  lat: number | null
  lng: number | null
}

interface PlanItRecord {
  uid?: string
  reference?: string
  area_name?: string
  address?: string
  description?: string
  app_state?: string
  app_type?: string
  start_date?: string
  decided_date?: string | null
  url?: string
  location?: { coordinates?: [number, number] } | null
}

const APPLICS_URL = 'https://www.planit.org.uk/api/applics/json'
const UA = 'PlanningPing/1.0 (+https://planningping.vercel.app)'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// UK postcodes need a space before the last 3 characters (the "inward code").
// Users/DB rows sometimes store them without one ("BS79DZ") — PlanIt's pcode
// param 400s on that. Normalise before every request.
function normalisePostcode(pc: string): string {
  const compact = pc.replace(/\s+/g, '').toUpperCase()
  if (compact.length < 5) return pc.trim().toUpperCase()
  return `${compact.slice(0, -3)} ${compact.slice(-3)}`
}

function mapRecord(r: PlanItRecord): PlanItApplication | null {
  const reference = (r.uid ?? r.reference ?? '').trim()
  const councilName = (r.area_name ?? '').trim()
  if (!reference || !councilName) return null
  const coords = r.location?.coordinates
  return {
    reference,
    councilName,
    address: r.address?.trim() || null,
    description: r.description?.trim() || null,
    status: r.app_state?.trim() || null,
    applicationDate: r.start_date || null,
    decisionDate: r.decided_date || null,
    appType: r.app_type?.trim() || null,
    url: r.url || null,
    lat: coords ? coords[1] : null,
    lng: coords ? coords[0] : null,
  }
}

// Applications near a postcode. Retries on 429 with exponential backoff
// (Retry-After header wins when present) — PlanIt is a shared free resource and
// a burst of tracked-area queries can trip its limiter well before any single
// request looks abusive.
export async function fetchNearby(opts: {
  postcode: string
  radiusKm: number
  recentDays: number
  pageSize?: number
}): Promise<PlanItApplication[]> {
  const params = new URLSearchParams({
    pcode: normalisePostcode(opts.postcode),
    krad: String(opts.radiusKm),
    recent: String(opts.recentDays),
    pg_sz: String(opts.pageSize ?? 200),
  })
  const url = `${APPLICS_URL}?${params.toString()}`

  const MAX_ATTEMPTS = 4
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } })
    if (res.status === 429) {
      const header = Number(res.headers.get('retry-after'))
      const backoff = Number.isFinite(header) && header > 0 ? header * 1000 : 2000 * 2 ** attempt
      await sleep(Math.min(backoff, 20_000))
      continue
    }
    if (!res.ok) throw new Error(`PlanIt HTTP ${res.status} for postcode "${opts.postcode}"`)
    const json = (await res.json()) as { records?: PlanItRecord[] }
    return (json.records ?? [])
      .map(mapRecord)
      .filter((a): a is PlanItApplication => a !== null)
  }
  throw new Error(`PlanIt rate-limited (429) after ${MAX_ATTEMPTS} attempts`)
}

// Slug for a PlanIt authority we don't already have, e.g.
// "Bristol, City of" -> "bristol-city-of".
export function slugifyAuthority(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/&/g, 'and')
    .replace(/[.,'()]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
