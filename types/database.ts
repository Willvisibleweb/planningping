// Hand-written types matching supabase/schema.sql.
// When the schema changes, update these types to match.

export type Plan = 'free' | 'paid'
export type DigestDay = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'

export interface Profile {
  id: string
  email: string
  plan: Plan
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
