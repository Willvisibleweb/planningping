// CSV export of the opportunity feed.
//
// Reuses parseFilters/applyFilters rather than reimplementing the query, so the
// file matches what is on screen. Rebuilding the filtering here would guarantee
// the two drift, and an export that quietly returns something other than what
// the user filtered to is worse than no export: they will not check, they will
// send it to a colleague.
//
// The screen caps at 100 rows for rendering; this does not. Someone exporting
// wants the whole result set, and the reason to look at a spreadsheet is
// precisely to work through more than fits on a page.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getProfile, hasProAccess } from '@/lib/access'
import { parseFilters, applyFilters } from '@/lib/filters/opportunityFilters'
import { toCsv, csvFilename, type CsvColumn } from '@/lib/export/csv'
import type { PlanningApplication } from '@/types/database'

// High enough that no realistic filtered view is truncated, low enough that one
// request cannot try to stream the entire table into memory.
const MAX_ROWS = 5000

const COLUMNS: CsvColumn<PlanningApplication>[] = [
  { header: 'Reference', value: (a) => a.reference },
  { header: 'Council', value: (a) => a.council_slug },
  { header: 'Address', value: (a) => a.address },
  { header: 'Description', value: (a) => a.description },
  { header: 'Fit score', value: (a) => a.score },
  // The band is exported as the word the product uses, not HOT/WARM/COLD.
  // A spreadsheet outlives the session it came from, and "COLD" means nothing
  // to a colleague who has never seen the app.
  {
    header: 'Fit',
    value: (a) =>
      a.band === 'HOT' ? 'Strong match'
        : a.band === 'WARM' ? 'Worth reviewing'
          : a.band === 'COLD' ? 'Low priority'
            : '',
  },
  { header: 'Why it scored', value: (a) => (a.score_reasons ?? []).join('; ') },
  { header: 'Status', value: (a) => a.status },
  { header: 'Submitted', value: (a) => a.application_date },
  { header: 'Decision due', value: (a) => a.target_decision_date },
  { header: 'Decided', value: (a) => a.decision_date },
  { header: 'Agent', value: (a) => a.agent_company },
  { header: 'Council record', value: (a) => (typeof a.raw_data?.url === 'string' ? a.raw_data.url : '') },
]

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const profile = await getProfile()
  if (!profile) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })

  // Export is a paid feature. The UI hides the button without access, but this
  // is the enforcement point — a URL is trivially guessable.
  if (!hasProAccess(profile)) {
    return NextResponse.json({ error: 'Export requires an active plan.' }, { status: 403 })
  }

  const { data: areas } = await supabase
    .from('tracked_areas')
    .select('council_slug')
    .eq('is_active', true)

  const councilSlugs = [...new Set(((areas ?? []) as { council_slug: string }[]).map((a) => a.council_slug))]
  if (councilSlugs.length === 0) {
    return new NextResponse(toCsv([], COLUMNS), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${csvFilename('planningping-opportunities')}"`,
      },
    })
  }

  const filters = parseFilters(Object.fromEntries(request.nextUrl.searchParams))

  const query = applyFilters(
    supabase
      .from('planning_applications')
      .select('*')
      .in('council_slug', councilSlugs)
      .not('band', 'is', null)
      .order('score', { ascending: false })
      .limit(MAX_ROWS),
    filters,
  )

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: 'Could not build the export.' }, { status: 500 })
  }

  const csv = toCsv((data ?? []) as PlanningApplication[], COLUMNS)

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${csvFilename('planningping-opportunities')}"`,
      // Never cached: the export reflects filters in the query string and data
      // that changes daily.
      'Cache-Control': 'no-store',
    },
  })
}
