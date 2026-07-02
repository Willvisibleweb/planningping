// Hand-written types matching supabase/schema.sql.
// When the schema changes, update these types to match.

export type Plan = 'free' | 'pro'
export type UserType = 'homeowner' | 'professional'
export type DigestDay = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'

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
  digest_day: DigestDay
  created_at: string
}

export interface TrackedArea {
  id: string
  user_id: string
  label: string
  postcode: string
  council_slug: string
  radius_metres: number
  is_active: boolean
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
  state_hash: string | null
  raw_data: Record<string, unknown> | null
  last_scraped_at: string | null
  created_at: string
  updated_at: string
  // Civils lead-scoring layer (prototype). Null until /api/score has run.
  score: number | null
  band: 'HOT' | 'WARM' | 'COLD' | null
  score_reasons: string[] | null
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

// Pipeline stages for the civils CRM. Order matters for display.
export type PipelineStage = 'Identified' | 'Contacted' | 'Negotiating' | 'Won' | 'Lost'

export const PIPELINE_STAGES: PipelineStage[] = [
  'Identified', 'Contacted', 'Negotiating', 'Won', 'Lost',
]

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
  pipeline_stage: PipelineStage
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
