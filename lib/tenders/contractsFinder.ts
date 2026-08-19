// Contracts Finder — public sector tenders, as a second opportunity signal.
//
// Planning tells you something is going to be built. A tender tells you someone
// is buying the work, with a budget attached. For a firm that sells to public
// bodies that is a nearer-term signal, and it carries the one field planning
// data never has: a contract value.
//
// Two things measured against the live API before building on it, because both
// shape the design:
//
//   Only 49% of tenders carry a delivery postcode, and only 39% are
//   construction-related. About 24% are both — so a quarter of what is
//   published is usable here, and the rest is filtered out rather than stored.
//
//   The OCDS search endpoint silently ignores a `keyword` parameter. Passing
//   keyword=drainage returns the identical first record as passing nothing: a
//   cleaning contract. Relevance filtering therefore happens here, not there,
//   and anything that looks like server-side keyword filtering is a mirage.

const ENDPOINT = 'https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search'
const UA = 'PlanningPing/1.0 (+https://planningping.com)'
const TIMEOUT_MS = 20_000

export interface Tender {
  /** OCDS release id — stable, and what we deduplicate on. */
  ocid: string
  title: string
  description: string | null
  buyer: string | null
  /** In GBP. Null where the buyer did not publish one. */
  valueGbp: number | null
  /** CPV-style category from the notice. */
  classification: string | null
  /** Delivery postcode, when given — this is what scopes a tender to a territory. */
  postcode: string | null
  publishedAt: string | null
  closesAt: string | null
  url: string | null
}

// Deliberately broad, and matched against title, description and classification
// together. A tender titled "Framework Agreement" reveals nothing; its
// description and CPV category usually do. Over-matching is corrected by the
// user's own filters downstream; under-matching loses the lead silently.
const CONSTRUCTION = new RegExp(
  [
    'construction', 'civil engineer', 'groundwork', 'earthwork', 'excavat',
    'drainage', 'sewer', 'surface water', 'suds', 'culvert',
    'highway', 'carriageway', 'footway', 'paving', 'surfacing', 'road works',
    'bridge', 'retaining wall', 'structural', 'piling', 'foundation',
    'demolition', 'remediation', 'flood', 'water main', 'utilities',
    'refurbishment', 'new build', 'building works',
  ].join('|'),
  'i',
)

interface OcdsRelease {
  ocid?: string
  id?: string
  date?: string
  buyer?: { name?: string }
  tender?: {
    title?: string
    description?: string
    value?: { amount?: number; currency?: string }
    classification?: { description?: string }
    tenderPeriod?: { endDate?: string }
    items?: { deliveryAddresses?: { postalCode?: string }[] }[]
    documents?: { url?: string }[]
  }
}

function firstPostcode(release: OcdsRelease): string | null {
  for (const item of release.tender?.items ?? []) {
    for (const addr of item.deliveryAddresses ?? []) {
      const pc = addr.postalCode?.trim().toUpperCase()
      if (pc) return pc
    }
  }
  return null
}

/** The outward code — "ST13 5RS" becomes "ST13" — which is how territories match. */
export function outwardCode(postcode: string): string | null {
  const m = postcode.trim().toUpperCase().match(/^([A-Z]{1,2}\d[A-Z\d]?)/)
  return m ? m[1] : null
}

export function looksConstructionRelated(t: {
  title: string
  description: string | null
  classification: string | null
}): boolean {
  return CONSTRUCTION.test(`${t.title} ${t.description ?? ''} ${t.classification ?? ''}`)
}

/**
 * Fetch recently published tenders.
 *
 * Returns only those that are construction-related AND carry a postcode, since
 * a tender we cannot locate cannot be attributed to anyone's territory and a
 * tender for pharmaceuticals is noise. Both are cheap to re-derive later if the
 * product ever wants the unfiltered feed.
 *
 * Throws nothing: a failure returns an empty array, because this is a secondary
 * signal and an outage here must not take down an ingest run that is also doing
 * planning data.
 */
export async function fetchRecentTenders(publishedFrom: string): Promise<Tender[]> {
  try {
    const url = `${ENDPOINT}?stages=tender&publishedFrom=${encodeURIComponent(publishedFrom)}`
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) return []

    const json = await res.json()
    const releases = (json?.releases ?? []) as OcdsRelease[]

    const out: Tender[] = []
    for (const r of releases) {
      const t = r.tender
      if (!t?.title) continue

      const postcode = firstPostcode(r)
      if (!postcode) continue

      const tender: Tender = {
        ocid: r.ocid ?? r.id ?? '',
        title: t.title,
        description: t.description?.trim() || null,
        buyer: r.buyer?.name ?? null,
        // Only GBP amounts are kept. A figure in another currency compared
        // against a pound threshold is worse than no figure at all.
        valueGbp:
          t.value?.currency === 'GBP' && typeof t.value.amount === 'number'
            ? t.value.amount
            : null,
        classification: t.classification?.description ?? null,
        postcode,
        publishedAt: r.date?.slice(0, 10) ?? null,
        closesAt: t.tenderPeriod?.endDate?.slice(0, 10) ?? null,
        url: t.documents?.[0]?.url ?? null,
      }

      if (!tender.ocid) continue
      if (!looksConstructionRelated(tender)) continue
      out.push(tender)
    }
    return out
  } catch {
    return []
  }
}
