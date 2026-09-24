// The figures behind the public data-quality page.
//
// This is the one place customer-facing reliability numbers are assembled, and
// everything it returns is a COUNT or a RATE. No postcode, territory, email,
// council failure detail or individual application ever leaves here — the page
// is world-readable, and the honest way to keep it that way is for the data
// layer to be incapable of carrying anything else rather than for the template
// to remember not to render it.
//
// Every number is counted from stored rows. Where there is nothing to count,
// the field is null and the page says so, because an invented figure on a page
// whose entire purpose is trustworthiness is worse than an absent one.

import type { createAdminClient } from '@/lib/supabase/admin'
import { computeBenchmarkMetrics, type BenchmarkItemResult, type Rate } from '@/lib/reliability/benchmark'
import { getGlobalIngestFreshness, STALE_AFTER_HOURS } from '@/lib/health/ingestFreshness'

type AdminClient = ReturnType<typeof createAdminClient>

export interface AuditFigures {
  /** Name of the most recent benchmark set, and when it was run. */
  setName: string
  ranAt: string
  externalSource: string | null
  items: number
  councils: number
  /** Percentage agreement per field, only where something was judged. */
  fields: Array<{ label: string; checked: number; agreement: number | null }>
  duplicateRatePct: number | null
  medianDelayDays: number | null
  meanDelayDays: number | null
  delaySamples: number
}

export interface CoverageFigures {
  councilsKnown: number
  councilsWithData: number
  applicationsStored: number
  applicationsLast30Days: number
}

export interface FreshnessFigures {
  hoursSinceLastFetch: number | null
  staleThresholdHours: number
  /** True when every tracked area is inside the freshness threshold. */
  allCurrent: boolean
}

export interface PublicDataQuality {
  audit: AuditFigures | null
  coverage: CoverageFigures
  freshness: FreshnessFigures
  generatedAt: string
}

const FIELD_LABELS: Record<string, string> = {
  reference: 'Application reference',
  address: 'Site address',
  description: 'Proposal description',
  status: 'Status',
  source_url: 'Link to the council record',
}

/** A Rate carries a 0-1 ratio; the page shows a percentage to one decimal. */
function pct(r: Rate): number | null {
  return r.value === null ? null : Math.round(r.value * 1000) / 10
}

async function loadAudit(db: AdminClient): Promise<AuditFigures | null> {
  const { data: sets } = await db
    .from('benchmark_sets')
    .select('id, name, external_source, created_at')
    .order('created_at', { ascending: false })
    .limit(1)
  const set = sets?.[0] as { id: string; name: string; external_source: string | null; created_at: string } | undefined
  if (!set) return null

  const { data: rows } = await db
    .from('benchmark_items')
    .select(
      'council_slug, found, reference_verdict, address_verdict, applicant_verdict, description_verdict, ' +
        'status_verdict, source_url_verdict, duplicate_count, ai_claims_checked, ai_unsupported_claims, ' +
        'classification_verdict, detection_delay_days',
    )
    .eq('set_id', set.id)
    .limit(5000)
  const items = (rows ?? []) as unknown as Array<BenchmarkItemResult & { council_slug: string | null }>
  if (items.length === 0) return null

  const metrics = computeBenchmarkMetrics(items)

  // Applicant is deliberately absent: council summary pages do not publish it,
  // so there is nothing to compare against and a row saying "not measured"
  // adds noise rather than information.
  const fields = (['reference', 'address', 'description', 'status', 'source_url'] as const).map((field) => {
    const acc = metrics.fieldAccuracy[field]
    return { label: FIELD_LABELS[field], checked: acc.denominator, agreement: pct(acc) }
  })

  return {
    setName: set.name,
    ranAt: set.created_at,
    externalSource: set.external_source,
    items: metrics.items,
    councils: new Set(items.map((i) => i.council_slug).filter(Boolean)).size,
    fields,
    duplicateRatePct: pct(metrics.duplicateRate),
    medianDelayDays: metrics.medianDetectionDelayDays,
    meanDelayDays: metrics.averageDetectionDelayDays,
    delaySamples: metrics.delaySamples,
  }
}

async function loadCoverage(db: AdminClient): Promise<CoverageFigures> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
  const [councils, stored, recent, slugs] = await Promise.all([
    db.from('councils').select('slug', { count: 'exact', head: true }),
    db.from('planning_applications').select('id', { count: 'exact', head: true }),
    db
      .from('planning_applications')
      .select('id', { count: 'exact', head: true })
      .gte('application_date', thirtyDaysAgo),
    db.from('planning_applications').select('council_slug').limit(50000),
  ])

  // Distinct councils, counted here rather than in SQL: Postgrest has no
  // distinct-count, and the page is revalidated hourly so this runs once an
  // hour rather than per visitor.
  const councilsWithData = new Set(
    ((slugs.data ?? []) as Array<{ council_slug: string }>).map((r) => r.council_slug),
  ).size

  return {
    councilsKnown: councils.count ?? 0,
    councilsWithData,
    applicationsStored: stored.count ?? 0,
    applicationsLast30Days: recent.count ?? 0,
  }
}

export async function loadPublicDataQuality(db: AdminClient): Promise<PublicDataQuality> {
  const [audit, coverage, freshness] = await Promise.all([
    loadAudit(db).catch(() => null),
    loadCoverage(db),
    getGlobalIngestFreshness().catch(() => null),
  ])

  return {
    audit,
    coverage,
    freshness: {
      hoursSinceLastFetch: freshness?.hoursSinceFetch ?? null,
      staleThresholdHours: STALE_AFTER_HOURS,
      allCurrent: freshness ? !freshness.stale && freshness.staleAreas === 0 : false,
    },
    generatedAt: new Date().toISOString(),
  }
}
