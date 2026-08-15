// Hand-written types matching supabase/schema.sql.
// When the schema changes, update these types to match.

export type Plan = 'free' | 'pro'
export type UserType = 'homeowner' | 'professional'
export type DigestDay = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'
// 'ALL' shows everything; 'WARM_PLUS'/'HOT_ONLY' hide bands below the
// threshold (reuses the civils scoring engine's band, see lib/scoring) — one
// stored preference drives both the dashboard display and alert fan-out.
export type MinBand = 'ALL' | 'WARM_PLUS' | 'HOT_ONLY'

export interface Profile {
  id: string
  email: string
  plan: Plan
  user_type: UserType
  // Professional trial deadline (ISO timestamp). Null = never had a trial.
  trial_ends_at: string | null
  // Stripe linkage — populated by checkout/webhook (Phase B). Kept loose:
  // subscription_status carries Stripe's own strings ('active', 'past_due', …).
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  subscription_status: string | null
  // Which paid tier ('mid'|'top') once professional+hasProAccess is true.
  // Null = free tier, or trialing without a completed checkout yet — see
  // lib/access.ts's effectiveTier() for how the null case is resolved.
  pro_tier: 'mid' | 'top' | null
  digest_day: DigestDay
  // Partner network this account belongs to, or null for the standard
  // experience. Gates partner-only UI and server actions — see lib/features.ts.
  partnership_provider: PartnershipProvider | null
  // Non-secret partner-side account identifier (a GabrielCAM Hub ID). Never a
  // credential: this row is readable by its owner under RLS.
  partner_hub_id: string | null
  created_at: string
}

// Declared in lib/features.ts alongside the gating logic that consumes it, and
// re-exported here so callers importing Profile get its field types too.
import type { PartnershipProvider } from '@/lib/features'
export { PARTNERSHIP_PROVIDERS, type PartnershipProvider } from '@/lib/features'

export interface TrackedArea {
  id: string
  user_id: string
  label: string
  postcode: string
  council_slug: string
  radius_metres: number
  is_active: boolean
  min_band: MinBand
  // Professional-tier only — enforced server-side in updateTrackedAreaSettings,
  // not by RLS. See app/api/cron/ingest/route.ts for the fan-out that reads it.
  alerts_enabled: boolean
  // Last successful PlanIt fetch. The ingest orders by this so a run that stops
  // early on its time budget doesn't starve the same areas every time.
  last_planit_fetch_at: string | null
  created_at: string
}

export interface PlanningApplication {
  id: string
  council_slug: string
  reference: string
  address: string | null
  description: string | null
  status: string | null
  application_date: string | null  // ISO date string
  decision_date: string | null     // ISO date string
  // The architect or planning consultant who submitted it. For a civils firm
  // this is the actual contact route — you approach the agent, not the
  // applicant. Null where the council withholds it (PlanIt returns the literal
  // "See source", which the mapper strips).
  agent_company: string | null
  // Date the authority must determine by. This is what turns "submitted" into
  // "decide by 21 September".
  target_decision_date: string | null
  state_hash: string | null
  raw_data: Record<string, unknown> | null
  last_scraped_at: string | null
  created_at: string
  updated_at: string
  // Civils lead-scoring layer (prototype). Null until /api/score has run.
  score: number | null
  band: 'HOT' | 'WARM' | 'COLD' | null
  score_reasons: string[] | null
  // Discharge-of-condition tracking (see lib/classification). Null unless
  // this row was classified as a discharge application.
  application_type: 'discharge_of_condition' | null
  parent_application_reference: string | null
  parent_application_id: string | null
  parent_reference_needs_review: boolean
  is_stale: boolean
}

export interface Digest {
  id: string
  user_id: string
  sent_at: string
  period_start: string   // ISO date string
  period_end: string     // ISO date string
  application_count: number
  summary: string | null
}

// Letterhead identity for the formal-letter outreach mode. Own table, not
// profiles columns — profiles is locked down to a single user-writable
// column (migration 0006). logo_path is a private storage object path
// ("firm-logos" bucket), never a public URL.
export interface FirmProfile {
  id: string
  user_id: string
  business_name: string | null
  address: string | null
  phone: string | null
  contact_email: string | null
  logo_path: string | null
  created_at: string
  updated_at: string
}

// A stage in one user's pipeline. Rows, not a union type: engineering firms run
// their own process, and a hardcoded enum meant a migration every time one of
// them wanted a different word. Seeded per user on signup (migration 0022).
export interface PipelineStageRow {
  id: string
  user_id: string
  name: string
  position: number
  // Terminal flags rather than name-matching, so renaming "Won" to "Awarded"
  // doesn't silently break win-rate reporting.
  is_won: boolean
  is_lost: boolean
  created_at: string
}

// The defaults every account starts with. Kept in sync with handle_new_user in
// migration 0022 — this constant is for seeding UI before a fetch resolves and
// for tests, never as the source of truth for what a user's stages are.
export const DEFAULT_STAGE_NAMES = [
  'New', 'Qualified', 'Contacted', 'In conversation', 'Won', 'Lost',
] as const

/**
 * @deprecated The old hardcoded set. tracked_leads.pipeline_stage is retained
 * only until every read path uses stage_id, then both are dropped. Do not use
 * for anything new — read pipeline_stages instead.
 */
export type PipelineStage = 'Identified' | 'Contacted' | 'Negotiating' | 'Won' | 'Lost'

/** @deprecated See PipelineStage above. */
export const PIPELINE_STAGES: PipelineStage[] = [
  'Identified', 'Contacted', 'Negotiating', 'Won', 'Lost',
]

// One entry in a lead's activity timeline. Append-only — see lead_events in
// migration 0022 for why there is no update path.
export interface LeadEvent {
  id: string
  lead_id: string
  user_id: string
  type: 'created' | 'stage_change' | 'note' | 'letter_generated' | 'email_logged' | 'call_logged'
  body: string | null
  created_at: string
  created_by: string | null
}

// A planning application a user is tracking through their sales pipeline.
export interface TrackedLead {
  id: string
  user_id: string
  application_id: string
  council_slug: string
  reference: string
  description: string | null
  address: string | null
  cached_status: string | null
  /** @deprecated Read stage_id and join pipeline_stages. Retained during migration. */
  pipeline_stage: PipelineStage
  stage_id: string | null
  // The score when this lead was added, NOT the current one. Applications are
  // re-scored as rules change, so comparing this against the live score shows
  // drift — "scored 82 when you added it, now 64" is a signal, not a bug.
  score_at_add: number | null
  value_estimate: number | null
  owner: string | null
  last_contacted_at: string | null  // ISO timestamp
  next_follow_up_at: string | null  // ISO timestamp
  priority_follow_up: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

// Payload shape n8n sends to the webhook endpoint when delivering scrape results.
export interface WebhookPayload {
  council_slug: string
  applications: WebhookApplication[]
}

export interface WebhookApplication {
  reference: string
  address?: string
  description?: string
  status?: string
  application_date?: string
  decision_date?: string
  raw_data?: Record<string, unknown>
}
