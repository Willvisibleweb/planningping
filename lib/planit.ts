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
const AREAS_URL = 'https://www.planit.org.uk/api/areas/json'
const UA = 'PlanningPing/1.0 (+https://planningping.com)'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Shared GET-with-429-backoff — used by every PlanIt query shape (postcode
// radius, authority name, area list). Retry-After wins when PlanIt sends it;
// otherwise exponential backoff, capped at maxBackoffMs.
//
// Defaults (4 attempts, 20s cap) suit fetchNearby — a live user is waiting,
// so it's worth persisting through a 429. Background batch callers
// (fetchByAuthority, fetchAuthorityList) pass a smaller budget: a council
// that fails today just gets retried tomorrow via the last_planit_fetch_at
// queue, so burning minutes retrying one council there only starves the
// rest of the batch and makes the whole run look hung.
// A healthy PlanIt query answers in about 3 seconds. When its own data source
// stalls it sits for 45 and then returns a 400, and the ingest has a 300-second
// budget for fourteen of these — so a handful of stalls used up the entire run.
// Giving up at 18s costs nothing on a good day and keeps one bad upstream call
// from starving every area behind it.
const REQUEST_TIMEOUT_MS = 18_000

async function getWithBackoff(
  url: string,
  opts?: { maxAttempts?: number; maxBackoffMs?: number },
): Promise<Response> {
  const maxAttempts = opts?.maxAttempts ?? 4
  const maxBackoffMs = opts?.maxBackoffMs ?? 20_000
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (res.status === 429) {
      const header = Number(res.headers.get('retry-after'))
      const backoff = Number.isFinite(header) && header > 0 ? header * 1000 : 2000 * 2 ** attempt
      await sleep(Math.min(backoff, maxBackoffMs))
      continue
    }
    return res
  }
  throw new Error(`PlanIt rate-limited (429) after repeated attempts: ${url}`)
}

// Background-batch retry budget — fail fast, see getWithBackoff comment above.
const BACKGROUND_BACKOFF = { maxAttempts: 2, maxBackoffMs: 4_000 }

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

  const res = await getWithBackoff(url)
  if (!res.ok) throw new Error(`PlanIt HTTP ${res.status} for postcode "${opts.postcode}"`)
  const json = (await res.json()) as { records?: PlanItRecord[] }
  return (json.records ?? [])
    .map(mapRecord)
    .filter((a): a is PlanItApplication => a !== null)
}

// Applications for a named authority directly (PlanIt's `auth` filter) —
// used by the national backfill, which has no postcode to search around.
export async function fetchByAuthority(opts: {
  authorityName: string
  recentDays: number
  pageSize?: number
}): Promise<PlanItApplication[]> {
  const params = new URLSearchParams({
    auth: opts.authorityName,
    recent: String(opts.recentDays),
    pg_sz: String(opts.pageSize ?? 200),
  })
  const url = `${APPLICS_URL}?${params.toString()}`

  const res = await getWithBackoff(url, BACKGROUND_BACKOFF)
  if (!res.ok) throw new Error(`PlanIt HTTP ${res.status} for authority "${opts.authorityName}"`)
  const json = (await res.json()) as { records?: PlanItRecord[] }
  return (json.records ?? [])
    .map(mapRecord)
    .filter((a): a is PlanItApplication => a !== null)
}

// The full list of UK planning authorities PlanIt knows about (~421). Used to
// seed councils we haven't encountered yet via the ordinary tracked-area flow,
// so the national backfill has something to iterate over even for authorities
// no user has ever searched near.
export async function fetchAuthorityList(): Promise<string[]> {
  const url = `${AREAS_URL}?area_type=planning&pg_sz=500&select=area_name`
  const res = await getWithBackoff(url, BACKGROUND_BACKOFF)
  if (!res.ok) throw new Error(`PlanIt HTTP ${res.status} fetching authority list`)
  const json = (await res.json()) as { records?: { area_name?: string }[] }
  return (json.records ?? [])
    .map((r) => r.area_name?.trim())
    .filter((n): n is string => !!n)
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
