// The tools the territory assistant can call.
//
// Tool use rather than context stuffing, and the difference matters. A
// territory can hold 1500 applications; putting them in the prompt would cost a
// fortune, blow the window, and still leave the model eyeballing rather than
// filtering. Given tools it composes a real query and answers from the rows
// that come back — so "drainage schemes submitted since June" is a database
// filter, not a guess.
//
// Every tool is bound to ONE territory's council at construction. The model
// never supplies a council, so no prompt can talk it into reading someone
// else's patch, and the queries additionally run through the caller's own
// Supabase client so RLS applies on top.

import * as z from 'zod/v4'
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod'
import { POSITIVE_GROUPS, POSITIVE_REASON_BY_ID, positiveSignals } from '@/lib/scoring/civilsCriteria'
import type { SupabaseClient } from '@supabase/supabase-js'

const SCOPE_IDS = POSITIVE_GROUPS.map((g) => g.id) as [string, ...string[]]

// Enough rows for the model to reason over, few enough that a broad question
// cannot drag half a council into the context window.
const MAX_ROWS = 25

export function buildTerritoryTools(supabase: SupabaseClient, councilSlug: string) {
  const filterApplications = betaZodTool({
    name: 'filter_applications',
    description:
      'Search planning applications in this territory. Use for any question ' +
      'about specific schemes — by trade/scope, recency, fit band, or free ' +
      'text in the description or address. Returns at most 25 applications, ' +
      'highest fit first. Prefer calling this over answering from memory.',
    inputSchema: z.object({
      scope: z
        .enum(SCOPE_IDS)
        .optional()
        .describe('Filter to applications the scorer flagged for this trade.'),
      band: z
        .enum(['HOT', 'WARM', 'COLD'])
        .optional()
        .describe('HOT = strong match, WARM = worth reviewing, COLD = low priority.'),
      daysBack: z
        .number()
        .int()
        .min(1)
        .max(730)
        .optional()
        .describe('Only applications submitted within this many days.'),
      search: z
        .string()
        .max(80)
        .optional()
        .describe('Free text matched against the description and address.'),
    }),
    async run(args) {
      let q = supabase
        .from('planning_applications')
        .select('reference, description, address, status, application_date, band, score, score_reasons, agent_company')
        .eq('council_slug', councilSlug)
        .order('score', { ascending: false, nullsFirst: false })
        .limit(MAX_ROWS)

      if (args.band) q = q.eq('band', args.band)
      if (args.scope) {
        const reason = POSITIVE_REASON_BY_ID.get(args.scope)
        if (reason) q = q.contains('score_reasons', [reason])
      }
      if (args.daysBack) {
        const from = new Date(Date.now() - args.daysBack * 86_400_000)
          .toISOString()
          .slice(0, 10)
        q = q.gte('application_date', from)
      }
      if (args.search) {
        // Escaped because a comma or parenthesis in the term would otherwise
        // be read as PostgREST's own or() syntax.
        const safe = args.search.replace(/[,()]/g, ' ')
        q = q.or(`description.ilike.%${safe}%,address.ilike.%${safe}%`)
      }

      const { data, error } = await q
      if (error) return `Could not run that search: ${error.message}`
      if (!data || data.length === 0) {
        return 'No applications matched those filters in this territory.'
      }

      // Returned as compact JSON rather than prose: the model reads it more
      // reliably, and it keeps the tool result small enough to be cheap.
      return JSON.stringify(
        data.map((r: Record<string, unknown>) => ({
          reference: r.reference,
          description: String(r.description ?? '').slice(0, 300),
          address: r.address,
          status: r.status,
          submitted: r.application_date,
          fit: r.band,
          score: r.score,
          signals: positiveSignals(r.score_reasons as string[]),
          agent: r.agent_company,
        })),
      )
    },
  })

  const territorySummary = betaZodTool({
    name: 'territory_summary',
    description:
      'Counts and breakdowns for the whole territory: total applications, ' +
      'how they split by fit band, which trades appear most, and the date ' +
      'range covered. Use for questions about the territory as a whole ' +
      'rather than about particular schemes.',
    inputSchema: z.object({}),
    async run() {
      const { data, error } = await supabase
        .from('planning_applications')
        .select('band, application_date, score_reasons')
        .eq('council_slug', councilSlug)
        .limit(2000)

      if (error) return `Could not read the territory: ${error.message}`
      const rows = (data ?? []) as {
        band: string | null
        application_date: string | null
        score_reasons: string[] | null
      }[]
      if (rows.length === 0) return 'This territory has no applications stored yet.'

      const bands: Record<string, number> = {}
      const scopes: Record<string, number> = {}
      const dates: string[] = []

      for (const r of rows) {
        bands[r.band ?? 'unscored'] = (bands[r.band ?? 'unscored'] ?? 0) + 1
        if (r.application_date) dates.push(r.application_date)
        for (const label of positiveSignals(r.score_reasons)) {
          scopes[label] = (scopes[label] ?? 0) + 1
        }
      }
      dates.sort()

      return JSON.stringify({
        // Flagged so the model can say "at least" rather than stating a total
        // it cannot actually see. Silently reporting 2000 as the total would
        // be a confident, wrong answer.
        total: rows.length,
        capped: rows.length === 2000,
        byFit: bands,
        topScopes: Object.fromEntries(
          Object.entries(scopes).sort((a, b) => b[1] - a[1]).slice(0, 6),
        ),
        oldest: dates[0] ?? null,
        newest: dates[dates.length - 1] ?? null,
      })
    },
  })

  return [filterApplications, territorySummary]
}
