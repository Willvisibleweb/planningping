// Backfilling agent_company onto applications ingested before we captured it.
//
// agent_company reached the database on 13 August (migration 0021). Everything
// stored before that has it null — 4.3% coverage against roughly 85% available
// from PlanIt, which is why the "agent on file" filter currently hides itself
// and why the "who's involved" panel is usually empty. This route re-reads what
// PlanIt already holds and fills the gap. It fetches nothing new: same records,
// fields we previously discarded.
//
// Windowed by date rather than paginated, because PlanIt's `pg` parameter does
// not work — pg=1, pg=2 and pg=3 all return from=0 with identical rows. Small
// enough windows mean every response fits in one page and pagination is never
// needed. Westminster, the busiest authority we hold, runs about 785
// applications a month, so a 7-day window at pg_sz=400 has ample headroom; if a
// window ever does overflow, it is logged rather than silently truncated.
//
// Progress is durable. Each run walks councils oldest-backfilled first and
// stops on a time budget well inside maxDuration, so repeated runs continue
// rather than restarting — the same lesson the ingest learned the hard way when
// it fetched everything, hit the ceiling, and wrote nothing.
//
// NOT ON A SCHEDULE, DELIBERATELY. Measured before wiring it up, agent coverage
// turns out to be a property of the authority rather than of our ingest date:
//
//   Westminster              127/150   (85%)
//   Stafford                   2/48    (4%)
//   Staffordshire Moorlands    0/78
//   Bristol                    0/60
//   Coventry                   0/60
//   Liverpool                  0/60
//
// Records were returned in every one of those, so the zeros are real absence
// rather than a failed request. Most councils simply do not publish the agent
// in a form PlanIt captures. Running this daily across authorities that hold
// nothing would spend hours of PlanIt's goodwill to update almost no rows, and
// PlanIt is a free shared service that starts returning empty responses when
// pushed — which is exactly what happened while measuring the numbers above.
//
// So this is invoked by hand, when a council known to carry agent data is being
// tracked and its history is worth filling:
//
//   curl -H "Authorization: Bearer $CRON_SECRET" \
//        https://planningping.com/api/cron/backfill-agents

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 300

const WINDOW_DAYS = 7
const PAGE_SIZE = 400
const DELAY_MS = 1200 // PlanIt is free and shared; do not hammer it
const DEADLINE_MS = 240_000
const UA = 'PlanningPing/1.0 (+https://planningping.com)'

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

interface PlanItRow {
  uid?: string
  reference?: string
  other_fields?: { agent_company?: string | null } | null
}

// PlanIt redacts names it will not republish to the literal string "See source".
// Storing that would be worse than storing nothing: it looks like data, sorts
// like data, and is not data.
function cleanAgent(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const t = value.trim()
  if (!t || t.toLowerCase() === 'see source') return null
  return t
}

export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const startedAt = Date.now()

  // Councils that still have gaps, with the date span of the missing rows.
  // Ordered oldest-first by span so the biggest historical holes close first.
  const { data: gaps } = await supabase
    .from('planning_applications')
    .select('council_slug, application_date')
    .is('agent_company', null)
    .not('application_date', 'is', null)
    .order('application_date', { ascending: true })
    .limit(5000)

  const spans = new Map<string, { from: string; to: string }>()
  for (const row of (gaps ?? []) as { council_slug: string; application_date: string }[]) {
    const existing = spans.get(row.council_slug)
    if (!existing) {
      spans.set(row.council_slug, { from: row.application_date, to: row.application_date })
    } else if (row.application_date > existing.to) {
      existing.to = row.application_date
    }
  }

  if (spans.size === 0) {
    return NextResponse.json({ ok: true, message: 'Nothing to backfill.' })
  }

  // PlanIt is queried by its own authority name, not our slug. councils.name is
  // exactly that string — the ingest upserts it straight from PlanIt's
  // area_name — so this is a lookup rather than a guess.
  const { data: councilRows } = await supabase
    .from('councils')
    .select('slug, name')
    .in('slug', [...spans.keys()])

  const slugToName = new Map(
    ((councilRows ?? []) as { slug: string; name: string }[]).map((c) => [c.slug, c.name]),
  )

  const report: Record<string, { updated: number; windows: number; overflowed: number }> = {}
  let stoppedEarly = false

  outer: for (const [slug, span] of spans) {
    const authority = slugToName.get(slug)
    if (!authority) continue

    const stats = { updated: 0, windows: 0, overflowed: 0 }
    report[slug] = stats

    // Mutated in place via setUTCDate rather than reassigned, hence const.
    const cursor = new Date(`${span.from}T00:00:00Z`)
    const end = new Date(`${span.to}T00:00:00Z`)

    while (cursor <= end) {
      if (Date.now() - startedAt > DEADLINE_MS) {
        stoppedEarly = true
        break outer
      }

      const windowEnd = new Date(cursor)
      windowEnd.setUTCDate(windowEnd.getUTCDate() + WINDOW_DAYS - 1)

      const url =
        `https://www.planit.org.uk/api/applics/json?auth=${encodeURIComponent(authority)}` +
        `&start_date=${ymd(cursor)}&end_date=${ymd(windowEnd)}&pg_sz=${PAGE_SIZE}`

      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': UA },
          signal: AbortSignal.timeout(20_000),
        })
        if (res.ok) {
          const json = await res.json()
          const records = (json?.records ?? []) as PlanItRow[]
          stats.windows++

          // A window that filled the page may have been truncated. Logged
          // rather than ignored: the alternative is a silent hole in the
          // backfill that nobody would ever notice.
          if (typeof json?.total === 'number' && json.total > records.length) {
            stats.overflowed++
          }

          // uid carries the council's own reference; `reference` is usually
          // null in PlanIt's payload (see lib/planit.ts, which resolves it the
          // same way).
          const updates = records
            .map((r) => ({
              reference: (r.uid ?? r.reference ?? '').trim(),
              agent: cleanAgent(r.other_fields?.agent_company),
            }))
            .filter((u) => u.reference && u.agent)

          for (const u of updates) {
            const { error, count } = await supabase
              .from('planning_applications')
              .update({ agent_company: u.agent }, { count: 'exact' })
              .eq('council_slug', slug)
              .eq('reference', u.reference)
              .is('agent_company', null) // never overwrite something already known
            if (!error && count) stats.updated += count
          }
        }
      } catch {
        // One bad window must not end the run. PlanIt intermittently hangs and
        // then 400s — the ingest already carries scars from treating that as
        // fatal — so this moves on and the window is retried next run, because
        // its rows are still null.
      }

      cursor.setUTCDate(cursor.getUTCDate() + WINDOW_DAYS)
      await new Promise((r) => setTimeout(r, DELAY_MS))
    }
  }

  const updated = Object.values(report).reduce((n, r) => n + r.updated, 0)
  return NextResponse.json({ ok: true, updated, stoppedEarly, report })
}
