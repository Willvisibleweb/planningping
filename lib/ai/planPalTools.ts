// The tools PlanPal can call.
//
// Where territoryTools is bound to one council, these are bound to every
// council the caller tracks — the whole portfolio at once, which is the point
// of a dashboard-level assistant. The slug list is resolved from the caller's
// own tracked_areas and closed over at construction, so the model never
// supplies a council and no prompt can reach an untracked one. Every query
// additionally runs through the caller's own Supabase client, so RLS applies
// on top of that.
//
// A note on what these deliberately cannot do: there is no national dataset
// behind PlanningPing. Applications exist only for councils somebody tracks,
// so a question about an untracked area has no answer here and the tools say
// so rather than returning an empty list that reads like "nothing happening".

import * as z from 'zod/v4'
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod'
import {
  POSITIVE_GROUPS,
  POSITIVE_REASON_BY_ID,
  positiveSignals,
  whereReason,
} from '@/lib/scoring/civilsCriteria'
import { getPortfolioStats } from '@/lib/ai/portfolioStats'
import type { SupabaseClient } from '@supabase/supabase-js'

const SCOPE_IDS = POSITIVE_GROUPS.map((g) => g.id) as [string, ...string[]]

// Enough for the model to reason over, few enough that a broad question cannot
// drag half the database into the context window.
const MAX_ROWS = 25

/** Free text is escaped: a comma or bracket would otherwise be read as PostgREST or() syntax. */
function safeSearch(term: string): string {
  return term.replace(/[,()]/g, ' ')
}

export function buildPlanPalTools(
  supabase: SupabaseClient,
  userId: string,
  councilSlugs: string[],
) {
  const searchApplications = betaZodTool({
    name: 'search_applications',
    description:
      'Search planning applications across ALL of the user\'s tracked territories at once. ' +
      'Use for any question about specific schemes — by trade, recency, fit band, ' +
      'council, or free text in the description or address. Returns at most 25, ' +
      'highest fit first.',
    inputSchema: z.object({
      council: z
        .string()
        .max(60)
        .optional()
        .describe('Narrow to one council slug. Omit to search every tracked territory.'),
      scope: z.enum(SCOPE_IDS).optional().describe('Only schemes the scorer flagged for this trade.'),
      band: z.enum(['HOT', 'WARM', 'COLD']).optional(),
      daysBack: z.number().int().min(1).max(730).optional(),
      search: z.string().max(80).optional().describe('Free text matched against description and address.'),
    }),
    async run(args) {
      // A council the model names is intersected with what the user tracks
      // rather than trusted — the closed-over list is always the ceiling.
      const slugs = args.council
        ? councilSlugs.filter((s) => s === args.council)
        : councilSlugs
      if (slugs.length === 0) {
        return `Not a territory this user tracks. They track: ${councilSlugs.join(', ') || 'none yet'}.`
      }

      let q = supabase
        .from('planning_applications')
        .select('reference, description, address, status, application_date, band, score, score_reasons, agent_company, council_slug')
        .in('council_slug', slugs)
        .order('score', { ascending: false, nullsFirst: false })
        .limit(MAX_ROWS)

      if (args.band) q = q.eq('band', args.band)
      if (args.scope) {
        const reason = POSITIVE_REASON_BY_ID.get(args.scope)
        // whereReason, not .contains(col, [str]) — score_reasons is jsonb and
        // a JS array serialises to Postgres array-literal syntax, which the
        // database rejects outright. See the helper.
        if (reason) q = whereReason(q, reason)
      }
      if (args.daysBack) {
        q = q.gte('application_date', new Date(Date.now() - args.daysBack * 86_400_000).toISOString().slice(0, 10))
      }
      if (args.search) {
        const safe = safeSearch(args.search)
        q = q.or(`description.ilike.%${safe}%,address.ilike.%${safe}%`)
      }

      const { data, error } = await q
      if (error) return `Could not run that search: ${error.message}`
      if (!data?.length) return 'No applications matched those filters in this user\'s territories.'

      return JSON.stringify(
        data.map((r: Record<string, unknown>) => ({
          reference: r.reference,
          council: r.council_slug,
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

  const portfolioSummary = betaZodTool({
    name: 'portfolio_summary',
    description:
      'Counts and breakdowns across every tracked territory: how many applications ' +
      'in total, the split by council and by fit band, which trades come up most, ' +
      'and the date range covered. Use for "how am I doing overall" questions.',
    inputSchema: z.object({}),
    async run() {
      // Counted in the database, not tallied from rows here — see
      // portfolioStats for why that distinction matters.
      const stats = await getPortfolioStats(supabase, councilSlugs)
      if (stats.total === 0) return 'No applications stored for this user\'s territories yet.'
      return JSON.stringify(stats)
    },
  })

  const listTerritories = betaZodTool({
    name: 'list_territories',
    description:
      'The territories this user tracks: label, postcode, council, search radius, ' +
      'minimum fit band and whether alerts are on. Use for questions about their ' +
      'setup, coverage, or what they are and are not watching.',
    inputSchema: z.object({}),
    async run() {
      const { data, error } = await supabase
        .from('tracked_areas')
        .select('label, postcode, council_slug, radius_metres, min_band, alerts_enabled, is_active')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })

      if (error) return `Could not read territories: ${error.message}`
      if (!data?.length) return 'This user tracks no territories yet.'

      return JSON.stringify(
        data.map((a: Record<string, unknown>) => ({
          label: a.label,
          postcode: a.postcode,
          council: a.council_slug,
          radiusKm: Number(a.radius_metres) / 1000,
          minimumFit: a.min_band,
          alerts: a.alerts_enabled ? 'on' : 'off',
          active: a.is_active !== false,
        })),
      )
    },
  })

  const pipelineSummary = betaZodTool({
    name: 'pipeline_summary',
    description:
      'The opportunities this user has added to their pipeline: which stage each ' +
      'is at, how long it has sat there, and which have follow-ups due. Use for ' +
      '"what should I chase" and "what is in my pipeline" questions.',
    inputSchema: z.object({}),
    async run() {
      const [{ data: leads, error }, { data: stages }] = await Promise.all([
        supabase
          .from('tracked_leads')
          .select('reference, description, council_slug, stage_id, cached_status, next_follow_up_at, last_contacted_at, priority_follow_up, value_estimate, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(MAX_ROWS),
        supabase
          .from('pipeline_stages')
          .select('id, name, position, is_won, is_lost')
          .eq('user_id', userId)
          .order('position', { ascending: true }),
      ])

      if (error) return `Could not read the pipeline: ${error.message}`
      if (!leads?.length) return 'This user has nothing in their pipeline yet.'

      const stageById = new Map(
        ((stages ?? []) as Record<string, unknown>[]).map((s) => [s.id as string, s]),
      )
      const today = new Date().toISOString().slice(0, 10)

      return JSON.stringify({
        stages: ((stages ?? []) as Record<string, unknown>[]).map((s) => s.name),
        leads: (leads as Record<string, unknown>[]).map((l) => {
          const stage = stageById.get(l.stage_id as string)
          return {
            reference: l.reference,
            council: l.council_slug,
            description: String(l.description ?? '').slice(0, 200),
            stage: stage?.name ?? 'unassigned',
            status: l.cached_status,
            addedOn: String(l.created_at ?? '').slice(0, 10),
            lastContacted: l.last_contacted_at ?? 'never',
            followUpDue: l.next_follow_up_at
              ? String(l.next_follow_up_at).slice(0, 10) <= today
                ? `OVERDUE (${String(l.next_follow_up_at).slice(0, 10)})`
                : String(l.next_follow_up_at).slice(0, 10)
              : null,
            flagged: l.priority_follow_up === true,
            // Never populated in practice today. Passed through as null so the
            // model reports it as not recorded rather than inventing a figure.
            valueEstimate: l.value_estimate ?? null,
          }
        }),
      })
    },
  })

  const findTenders = betaZodTool({
    name: 'find_tenders',
    description:
      'Public sector contract opportunities from Contracts Finder — a separate ' +
      'feed from planning applications, national rather than territory-scoped. ' +
      'Use when asked about tenders, contracts or public sector work.',
    inputSchema: z.object({
      search: z.string().max(80).optional().describe('Free text matched against title and description.'),
      openOnly: z.boolean().optional().describe('Only tenders that have not closed yet.'),
    }),
    async run(args) {
      let q = supabase
        .from('tenders')
        .select('title, buyer, value_gbp, postcode, published_at, closes_at, url')
        .order('published_at', { ascending: false })
        .limit(MAX_ROWS)

      if (args.openOnly) q = q.gte('closes_at', new Date().toISOString())
      if (args.search) {
        const safe = safeSearch(args.search)
        q = q.or(`title.ilike.%${safe}%,description.ilike.%${safe}%`)
      }

      const { data, error } = await q
      if (error) return `Could not read tenders: ${error.message}`
      if (!data?.length) return 'No tenders matched.'

      return JSON.stringify(
        data.map((t: Record<string, unknown>) => ({
          title: t.title,
          buyer: t.buyer,
          valueGbp: t.value_gbp ?? null,
          postcode: t.postcode,
          published: String(t.published_at ?? '').slice(0, 10),
          closes: String(t.closes_at ?? '').slice(0, 10) || null,
          url: t.url,
        })),
      )
    },
  })

  return [searchApplications, portfolioSummary, listTerritories, pipelineSummary, findTenders]
}
