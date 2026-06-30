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

  // Step 3b: Guard against mislabelled batches. If anything upstream (e.g. an
  // n8n bug) attributes one council's applications to another, the reference
  // prefix gives it away — councils with a distinctive prefix are registered in
  // councils.ref_prefix. Any application whose prefix belongs to a DIFFERENT
  // council than this batch claims is rejected and logged, never persisted.
  const { data: prefixed } = await supabase
    .from('councils')
    .select('slug, ref_prefixes')
    .not('ref_prefixes', 'is', null)

  const prefixToCouncil: Record<string, string> = {}
  for (const c of prefixed ?? []) {
    for (const p of (c.ref_prefixes as string[] | null) ?? []) {
      prefixToCouncil[String(p).toUpperCase()] = c.slug as string
    }
  }

  // The council a reference belongs to, by its leading alpha prefix (e.g.
  // "SMD/2024/0123" -> "SMD"). Undefined for numeric-only refs (can't validate).
  function ownerCouncil(reference: string): string | undefined {
    const prefix = (reference.match(/^[A-Za-z]+/)?.[0] ?? '').toUpperCase()
    return prefix ? prefixToCouncil[prefix] : undefined
  }

  const mislabelled: string[] = []

  // Step 4: Filter to only applications with genuine changes.
  const toUpsert = applications
    .filter((app: WebhookApplication) => typeof app.reference === 'string' && app.reference)
    .filter((app: WebhookApplication) => {
      const owner = ownerCouncil(app.reference)
      if (owner && owner !== council_slug) {
        mislabelled.push(app.reference)
        return false
      }
      return true
    })
    .map((app: WebhookApplication) => {
      const hash = computeStateHash(app.status, app.decision_date)
      return { app, hash }
    })
    .filter(({ app, hash }) => existingHashes[app.reference] !== hash)
    .map(({ app, hash }) => ({
      council_slug,
      reference: app.reference,
      address: cleanAddress(app.address),
      description: cleanText(app.description),
      status: cleanText(app.status),
      application_date: app.application_date ?? null,
      decision_date: app.decision_date ?? null,
      state_hash: hash,
      raw_data: app.raw_data ?? null,
      last_scraped_at: new Date().toISOString(),
    }))

  // Brand-new applications: references not previously stored for this council
  // (a status change on an existing application is NOT "new"). The digest email
  // uses these so subscribers are only notified about genuinely new items —
  // never the same 7-day window re-sent every run.
  const new_applications = toUpsert
    .filter((r) => !(r.reference in existingHashes))
    .map((r) => ({
      reference: r.reference,
      address: r.address,
      description: r.description,
      status: r.status,
      application_date: r.application_date,
    }))

  if (mislabelled.length > 0) {
    console.error(
      `Webhook REJECTED ${mislabelled.length} mislabelled application(s) sent as council_slug="${council_slug}" — reference prefix belongs to a different council: ${mislabelled.slice(0, 5).join(', ')}${mislabelled.length > 5 ? '…' : ''}`,
    )
  }

  if (toUpsert.length === 0) {
    return NextResponse.json({ received: applications.length, updated: 0, rejected: mislabelled.length, new_applications })
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

  // ── CRM status sync (Task 5) ────────────────────────────────────────────────
  // Any tracked_lead pointing at an application that just changed status gets
  // flagged as a priority follow-up, with its cached_status refreshed. This is
  // additive — it does not affect ingestion or the digest flow.
  await flagChangedLeads(supabase, council_slug, toUpsert)

  return NextResponse.json({ received: applications.length, updated: toUpsert.length, rejected: mislabelled.length, new_applications })
}

// Flag tracked leads whose underlying application changed in this scrape.
// Only touches leads that actually exist for the changed references, so it's
// cheap even when a council returns many applications.
async function flagChangedLeads(
  supabase: ReturnType<typeof createAdminClient>,
  councilSlug: string,
  changed: Array<{ reference: string; status: string | null }>,
): Promise<void> {
  if (changed.length === 0) return

  const statusByRef = new Map(changed.map((c) => [c.reference, c.status]))
  const changedRefs = [...statusByRef.keys()]

  // Which changed references are actually being tracked by someone?
  const { data: trackedRefs, error } = await supabase
    .from('tracked_leads')
    .select('reference')
    .eq('council_slug', councilSlug)
    .in('reference', changedRefs)

  if (error || !trackedRefs || trackedRefs.length === 0) return

  const uniqueRefs = [...new Set(trackedRefs.map((r) => r.reference as string))]

  // Update per reference so each lead gets its own new status. The set is small
  // (only tracked refs), so a short loop is fine.
  for (const ref of uniqueRefs) {
    await supabase
      .from('tracked_leads')
      .update({ priority_follow_up: true, cached_status: statusByRef.get(ref) ?? null })
      .eq('council_slug', councilSlug)
      .eq('reference', ref)
  }
}

// Hash the fields that indicate a meaningful change. If only peripheral fields
// change (e.g. a formatting tweak in the address), we don't treat it as a
// state change — avoiding unnecessary digest entries and OpenAI calls.
// Collapse ragged whitespace and trim. Returns null for empty/missing values.
function cleanText(s?: string | null): string | null {
  if (!s) return null
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > 0 ? t : null
}

// Normalise an address to Title Case while keeping UK postcodes and other
// alphanumeric tokens (house refs) uppercase — portals return random ALL-CAPS
// chunks like "CHEADLE ROAD, STAFFORDSHIRE, ST13 7HW".
function cleanAddress(s?: string | null): string | null {
  const t = cleanText(s)
  if (!t) return null
  return t
    .split(' ')
    .map((word) => {
      const core = word.replace(/[^A-Za-z0-9]/g, '')
      // Letter+digit tokens are postcodes/house refs → keep uppercase.
      if (/[A-Za-z]/.test(core) && /[0-9]/.test(core)) return word.toUpperCase()
      // Otherwise Title Case, preserving any trailing punctuation.
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join(' ')
}

function computeStateHash(status?: string, decisionDate?: string): string {
  const input = `${status ?? ''}|${decisionDate ?? ''}`
  return createHash('sha256').update(input).digest('hex')
}
