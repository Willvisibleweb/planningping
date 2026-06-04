// Webhook endpoint — receives scrape results from n8n.
//
// Security model:
// - n8n sends a shared secret in the x-webhook-secret header.
//   We verify it before doing anything else. Without this check,
//   anyone who discovered this URL could inject fake planning data.
// - We use the admin client (service role) to write data. This bypasses
//   RLS intentionally — n8n is a trusted system, not a user.
// - We never trust the incoming council_slug without basic sanitisation.
//
// Cost model:
// - For each application, we compute a state_hash from (status, decision_date).
// - If the hash matches what's already stored, we skip that row entirely.
//   This means a scrape run that finds no changes costs almost nothing.
// - We use upsert (insert or update on conflict) to handle both new
//   applications and status changes in a single operation.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createHash } from 'crypto'
import type { WebhookPayload, WebhookApplication } from '@/types/database'

export async function POST(request: NextRequest) {
  // Step 1: Verify the shared secret. Reject immediately if missing or wrong.
  const incomingSecret = request.headers.get('x-webhook-secret')
  if (!incomingSecret || incomingSecret !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  // Step 2: Parse and validate the payload.
  let payload: WebhookPayload
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { council_slug, applications } = payload

  if (typeof council_slug !== 'string' || !council_slug.match(/^[a-z0-9-]+$/)) {
    return NextResponse.json({ error: 'Invalid council_slug' }, { status: 400 })
  }

  if (!Array.isArray(applications) || applications.length === 0) {
    return NextResponse.json({ received: 0, updated: 0 })
  }

  // Step 3: Fetch existing state hashes for this council in one query.
  // This lets us skip unchanged applications without hitting the DB per row.
  const supabase = createAdminClient()
  const { data: existing } = await supabase
    .from('planning_applications')
    .select('reference, state_hash')
    .eq('council_slug', council_slug)

  const existingHashes: Record<string, string> = {}
  for (const row of existing ?? []) {
    existingHashes[row.reference] = row.state_hash ?? ''
  }

  // Step 4: Filter to only applications with genuine changes.
  const toUpsert = applications
    .filter((app: WebhookApplication) => typeof app.reference === 'string' && app.reference)
    .map((app: WebhookApplication) => {
      const hash = computeStateHash(app.status, app.decision_date)
      return { app, hash }
    })
    .filter(({ app, hash }) => existingHashes[app.reference] !== hash)
    .map(({ app, hash }) => ({
      council_slug,
      reference: app.reference,
      address: app.address ?? null,
      description: app.description ?? null,
      status: app.status ?? null,
      application_date: app.application_date ?? null,
      decision_date: app.decision_date ?? null,
      state_hash: hash,
      raw_data: app.raw_data ?? null,
      last_scraped_at: new Date().toISOString(),
    }))

  if (toUpsert.length === 0) {
    return NextResponse.json({ received: applications.length, updated: 0 })
  }

  // Step 5: Upsert changed rows. On conflict (same council + reference),
  // update the status fields. Never touch created_at.
  const { error } = await supabase
    .from('planning_applications')
    .upsert(toUpsert, {
      onConflict: 'council_slug,reference',
      ignoreDuplicates: false,
    })

  if (error) {
    console.error('Webhook upsert error:', error.message)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  return NextResponse.json({ received: applications.length, updated: toUpsert.length })
}

// Hash the fields that indicate a meaningful change. If only peripheral fields
// change (e.g. a formatting tweak in the address), we don't treat it as a
// state change — avoiding unnecessary digest entries and OpenAI calls.
function computeStateHash(status?: string, decisionDate?: string): string {
  const input = `${status ?? ''}|${decisionDate ?? ''}`
  return createHash('sha256').update(input).digest('hex')
}
