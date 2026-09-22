// PlanIt API client — https://www.planit.org.uk/api/
//
// Free, public, rate-limited aggregator covering ~420 UK planning authorities.
// Replaces the per-council Idox scraping: one clean HTTP call instead of a
// fragile portal-by-portal parser. Be polite — handle 429 with backoff.
//
// Query semantics, verified against the live API on 2026-09-14:
//   recent / start_date+end_date  filter on the SUBMISSION date (start_date).
//   different_start               filters on when the record's content last
//                                 changed — the only way to see a decision on
//                                 an application submitted months ago.
//   page (1-based) + pg_sz        paginate; the envelope's `total` says how
//                                 many exist. (`pg` is not a parameter — an
//                                 earlier test of it is why pagination was
//                                 believed not to work.)

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
  // The architect or planning consultant who submitted the application. For a
  // civils firm this is the actual route in — you contact the agent, not the
  // applicant. Populated on ~87% of records sampled across three councils.
  //
  // Note PlanIt redacts agent_name, applicant_name and case_officer to the
  // literal string "See source", so agent_company is the only usable identity
  // in the feed. mapRecord filters that placeholder out.
  agentCompany: string | null
  // The date the council must determine the application by. Turns "this was
  // submitted" into "decide by 21 September", which is the difference between
  // a notification and a reason to act. Present on ~99% of records.
  targetDecisionDate: string | null // YYYY-MM-DD
  /** PlanIt's own identifier for the record, e.g. "Rutland/2026/1126/FUL". */
  sourceRecordId: string | null
  /** When PlanIt last saw this record's content change (`last_different`). */
  sourceLastChangedAt: string | null
  /** The record exactly as PlanIt returned it, for the provenance snapshot. */
  raw: Record<string, unknown>
}

interface PlanItRecord {
  uid?: string
  reference?: string
  name?: string
  area_name?: string
  address?: string
  description?: string
  app_state?: string
  app_type?: string
  start_date?: string
  decided_date?: string | null
  last_different?: string | null
  url?: string
  location?: { coordinates?: [number, number] } | null
  // PlanIt buries the richest per-council detail in here rather than promoting
  // it to top-level fields. Only the two we use are typed; the rest are left
  // untyped deliberately so this doesn't become a second schema to maintain.
  other_fields?: {
    agent_company?: string | null
    target_decision_date?: string | null
    [key: string]: unknown
  } | null
}

// PlanIt writes this literal string where a council withholds a name. Storing
// it would put "See source" on screen as if it were a company.
const REDACTED = 'see source'
const POSTCODES_IO_URL = 'https://api.postcodes.io/postcodes'

function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.toLowerCase() === REDACTED) return null
  return trimmed
}

// Councils publish dates in a few shapes; anything that isn't a plain
// YYYY-MM-DD is dropped rather than stored as an unparseable string.
function cleanDate(value: unknown): string | null {
  const text = cleanText(value)
  if (!text) return null
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null
}

const APPLICS_URL = 'https://www.planit.org.uk/api/applics/json'
const AREAS_URL = 'https://www.planit.org.uk/api/areas/json'
const UA = 'PlanningPing/1.0 (+https://planningping.com)'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// A healthy PlanIt query answers in about 3 seconds. When its own data source
// stalls it sits for 45 and then returns a 400, and the ingest has a 300-second
// budget — so a handful of stalls used up the entire run. 18s was then too
// tight for the busiest territories (a 5km radius over Manchester consistently
// aborted mid-flight), so the ceiling is 30s. Safe because the ingest checks
// its own deadline before starting each query and stops early rather than
// overrunning.
const REQUEST_TIMEOUT_MS = 30_000

// Gateway errors and timeouts are PlanIt's upstream stalling, not a verdict on
// the query — worth one more try. A 400 is a verdict and is never retried.
const RETRYABLE_STATUS = new Set([500, 502, 503, 504])

export interface RequestStats {
  attempts: number
  lastStatus: number | null
}

// Shared GET-with-backoff. Retries 429 (Retry-After wins when present), gateway
// errors and network failures, with exponential backoff capped at maxBackoffMs.
//
// Defaults (4 attempts, 20s cap) suit a live user waiting on an add-territory
// fetch. Background batch callers pass a smaller budget: a council that fails
// today is retried tomorrow, and burning minutes on one council only starves
// the rest of the batch.
async function getWithBackoff(
  url: string,
  opts?: { maxAttempts?: number; maxBackoffMs?: number; stats?: RequestStats },
): Promise<Response> {
  const maxAttempts = opts?.maxAttempts ?? 4
  const maxBackoffMs = opts?.maxBackoffMs ?? 20_000
  let lastError: unknown = null
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (opts?.stats) opts.stats.attempts++
    let res: Response
    try {
      res = await fetch(url, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch (e) {
      lastError = e
      if (attempt < maxAttempts - 1) await sleep(Math.min(2000 * 2 ** attempt, maxBackoffMs))
      continue
    }
    if (opts?.stats) opts.stats.lastStatus = res.status
    if (res.status === 429 || RETRYABLE_STATUS.has(res.status)) {
      // Out of attempts: hand back the real response so the caller reports
      // the actual status rather than a generic failure.
      if (attempt === maxAttempts - 1) return res
      const header = Number(res.headers.get('retry-after'))
      const backoff = Number.isFinite(header) && header > 0 ? header * 1000 : 2000 * 2 ** attempt
      await res.body?.cancel().catch(() => {})
      await sleep(Math.min(backoff, maxBackoffMs))
      continue
    }
    return res
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`PlanIt request failed after ${maxAttempts} attempts`)
}

// Background-batch retry budget. Still bounded, but not hair-trigger: PlanIt
// often clears a 429 after one extra pause, and recording that as a failed
// source makes the data-health view noisy even when the previous successful
// sync is fresh.
const BACKGROUND_BACKOFF = { maxAttempts: 3, maxBackoffMs: 8_000 }
// Pages of one query are fetched in sequence with a short pause: this is one
// logical request split for size, not a burst.
const PAGE_DELAY_MS = 750

// UK postcodes need a space before the last 3 characters (the "inward code").
// Users/DB rows sometimes store them without one ("BS79DZ") — PlanIt's pcode
// param 400s on that. Normalise before every request.
function normalisePostcode(pc: string): string {
  const compact = pc.replace(/\s+/g, '').toUpperCase()
  if (compact.length < 5) return pc.trim().toUpperCase()
  return `${compact.slice(0, -3)} ${compact.slice(-3)}`
}

async function lookupPostcodeCoordinates(postcode: string): Promise<{ lat: number; lng: number } | null> {
  const compact = postcode.replace(/\s+/g, '').toUpperCase()
  try {
    const res = await fetch(`${POSTCODES_IO_URL}/${compact}`, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!res.ok) return null
    const json = await res.json()
    const lat = json.result?.latitude
    const lng = json.result?.longitude
    return typeof lat === 'number' && typeof lng === 'number' ? { lat, lng } : null
  } catch {
    return null
  }
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
    agentCompany: cleanText(r.other_fields?.agent_company),
    targetDecisionDate: cleanDate(r.other_fields?.target_decision_date),
    sourceRecordId: cleanText(r.name),
    sourceLastChangedAt: cleanText(r.last_different),
    raw: r as unknown as Record<string, unknown>,
  }
}

export type PlanItWhere =
  | { kind: 'postcode'; postcode: string; radiusKm: number }
  | { kind: 'authority'; authorityName: string }

export type PlanItWhen =
  | { kind: 'recent'; days: number }
  | { kind: 'submitted'; startDate: string; endDate: string }
  | { kind: 'changed'; differentStart: string }

export interface PlanItQueryResult {
  applications: PlanItApplication[]
  /** PlanIt's own count of matching records, when it reports one. */
  total: number | null
  /** Raw records received, before dropping any without a reference. */
  received: number
  /** True when PlanIt reported more records than were retrieved. */
  truncated: boolean
  pages: number
  attempts: number
  httpStatus: number | null
  usedCoordinateFallback: boolean
}

export class PlanItError extends Error {
  httpStatus: number | null
  attempts: number
  constructor(message: string, httpStatus: number | null, attempts: number) {
    super(message)
    this.name = 'PlanItError'
    this.httpStatus = httpStatus
    this.attempts = attempts
  }
}

function describeWhere(where: PlanItWhere): string {
  return where.kind === 'postcode' ? `postcode "${where.postcode}"` : `authority "${where.authorityName}"`
}

function locationParams(where: PlanItWhere): Record<string, string> {
  return where.kind === 'postcode'
    ? { pcode: normalisePostcode(where.postcode), krad: String(where.radiusKm) }
    : { auth: where.authorityName }
}

function whenParams(when: PlanItWhen): Record<string, string> {
  if (when.kind === 'recent') return { recent: String(when.days) }
  if (when.kind === 'submitted') return { start_date: when.startDate, end_date: when.endDate }
  return { different_start: when.differentStart }
}

/**
 * One logical PlanIt query, paginated to completion (up to maxPages), with the
 * postcode-to-coordinates fallback for postcodes PlanIt's gazetteer lacks
 * (CV1 1AN is valid on postcodes.io and unknown to PlanIt).
 */
export async function queryPlanIt(
  where: PlanItWhere,
  when: PlanItWhen,
  opts: { pageSize?: number; maxPages?: number; background?: boolean } = {},
): Promise<PlanItQueryResult> {
  const pageSize = opts.pageSize ?? 200
  const maxPages = opts.maxPages ?? 10
  const stats: RequestStats = { attempts: 0, lastStatus: null }
  const backoff = { ...(opts.background ? BACKGROUND_BACKOFF : {}), stats }

  let location = locationParams(where)
  let usedCoordinateFallback = false
  const applications: PlanItApplication[] = []
  let total: number | null = null
  let received = 0
  let pages = 0

  const urlFor = (page: number) =>
    `${APPLICS_URL}?${new URLSearchParams({ ...location, ...whenParams(when), pg_sz: String(pageSize), page: String(page) })}`

  for (let page = 1; page <= maxPages; page++) {
    let res = await getWithBackoff(urlFor(page), backoff)

    if (!res.ok && page === 1 && where.kind === 'postcode' && res.status === 400) {
      const body = await res.text().catch(() => '')
      const coords = body.toLowerCase().includes('no location found')
        ? await lookupPostcodeCoordinates(where.postcode)
        : null
      if (!coords) {
        throw new PlanItError(`PlanIt HTTP 400 for ${describeWhere(where)}`, 400, stats.attempts)
      }
      location = { lat: String(coords.lat), lng: String(coords.lng), krad: String(where.radiusKm) }
      usedCoordinateFallback = true
      res = await getWithBackoff(urlFor(page), backoff)
    }

    if (!res.ok) {
      throw new PlanItError(
        `PlanIt HTTP ${res.status} for ${describeWhere(where)}${usedCoordinateFallback ? ' (coordinate fallback)' : ''}`,
        res.status,
        stats.attempts,
      )
    }

    const json = (await res.json()) as { records?: PlanItRecord[]; total?: number }
    pages++
    const records = json.records ?? []
    if (typeof json.total === 'number') total = json.total
    received += records.length
    for (const r of records) {
      const mapped = mapRecord(r)
      if (mapped) applications.push(mapped)
    }

    if (records.length < pageSize) break
    if (total !== null && received >= total) break
    if (page < maxPages) await sleep(PAGE_DELAY_MS)
  }

  return {
    applications,
    total,
    received,
    truncated: total !== null && received < total,
    pages,
    attempts: stats.attempts,
    httpStatus: stats.lastStatus,
    usedCoordinateFallback,
  }
}

// Applications near a postcode. Kept for callers that only want the list.
export async function fetchNearby(opts: {
  postcode: string
  radiusKm: number
  /** Rolling window. Ignored when startDate/endDate are given. */
  recentDays: number
  /** Inclusive YYYY-MM-DD bounds, for backfilling history rather than the
   *  rolling window. Verified against the live API: pcode, krad and a date
   *  range are honoured together, and the radius still applies. */
  startDate?: string
  endDate?: string
  pageSize?: number
}): Promise<PlanItApplication[]> {
  const when: PlanItWhen =
    opts.startDate && opts.endDate
      ? { kind: 'submitted', startDate: opts.startDate, endDate: opts.endDate }
      : { kind: 'recent', days: opts.recentDays }
  const result = await queryPlanIt({ kind: 'postcode', postcode: opts.postcode, radiusKm: opts.radiusKm }, when, {
    pageSize: opts.pageSize,
  })
  return result.applications
}

// Applications for a named authority directly (PlanIt's `auth` filter) —
// used by the national backfill, which has no postcode to search around.
export async function fetchByAuthority(opts: {
  authorityName: string
  recentDays: number
  pageSize?: number
}): Promise<PlanItApplication[]> {
  const result = await queryPlanIt(
    { kind: 'authority', authorityName: opts.authorityName },
    { kind: 'recent', days: opts.recentDays },
    { pageSize: opts.pageSize, background: true },
  )
  return result.applications
}

// The full list of UK planning authorities PlanIt knows about (~421). Used to
// seed councils we haven't encountered yet via the ordinary tracked-area flow,
// so the national backfill has something to iterate over even for authorities
// no user has ever searched near.
export async function fetchAuthorityList(): Promise<string[]> {
  const url = `${AREAS_URL}?area_type=planning&pg_sz=500&select=area_name`
  const res = await getWithBackoff(url, BACKGROUND_BACKOFF)
  if (!res.ok) throw new PlanItError(`PlanIt HTTP ${res.status} fetching authority list`, res.status, 1)
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
