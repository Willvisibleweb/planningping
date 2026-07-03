// AI outreach draft generator (Task 4).
//
// Given a tracked lead, drafts a short, context-aware business-development email
// a civil engineering firm could send about the development — "mission-first":
// the angle is inferred from the application's description (e.g. an agricultural
// conversion → Class Q civils scope).
//
// Server-side only. The Anthropic API key never reaches the browser. Auth is the
// Supabase session, and RLS guarantees the lead belongs to the caller.
//
// Model: Claude Haiku 4.5 — fast and cheap, which suits short drafts generated
// during customer validation. To swap models later, change MODEL below.
//
// LLM SEAM: this is a single, stateless generation. If outreach quality needs to
// improve, raise the model (e.g. claude-opus-4-8) or enrich the prompt with more
// lead context — no structural change required.

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { getProfile, hasProAccess } from '@/lib/access'

const MODEL = 'claude-haiku-4-5'

// Per-user daily cap on draft generation. Each call costs Anthropic credits,
// so this bounds the worst case (e.g. a trial user generating in a loop).
// Counted per UTC day via outreach_log (migration 0007).
const DAILY_LIMIT = 20

const SYSTEM_PROMPT = `You are a business-development assistant for a UK civil engineering firm. You write short, specific, professional outreach emails to the applicant or agent behind a planning application, offering the firm's civil engineering services for that project.

Rules:
- Infer the likely civils scope from the development described (e.g. drainage/SuDS, groundworks/earthworks, highways/S278, structural/retaining, flood mitigation, an agricultural Class Q conversion, etc.) and lead with that angle.
- Keep it under ~150 words. Warm, direct, no waffle, no hype.
- Include a subject line, then the body. Use [Your name] / [Firm] placeholders — do not invent contact details.
- If the description is vague, keep the civils angle general rather than guessing specifics.
- Output only the email (subject + body). No preamble, no commentary.`

export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'Outreach is not configured (missing ANTHROPIC_API_KEY).' },
      { status: 503 },
    )
  }

  let body: { leadId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!body.leadId) return NextResponse.json({ error: 'leadId required' }, { status: 400 })

  // Auth + ownership: RLS only returns the lead if it belongs to this user.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  // Professional feature (and each call costs Anthropic credits) — enforce plan.
  if (!hasProAccess(await getProfile())) {
    return NextResponse.json(
      { error: 'This feature requires an active professional plan.' },
      { status: 403 },
    )
  }

  // Rate limit: count this user's generations since UTC midnight. RLS scopes
  // the count to their own rows, and outreach_log has no delete policy, so
  // the counter can't be reset from the client.
  const startOfDay = new Date()
  startOfDay.setUTCHours(0, 0, 0, 0)
  const { count } = await supabase
    .from('outreach_log')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('created_at', startOfDay.toISOString())

  if ((count ?? 0) >= DAILY_LIMIT) {
    return NextResponse.json(
      { error: `Daily limit reached (${DAILY_LIMIT} drafts). Try again tomorrow.` },
      { status: 429 },
    )
  }

  const { data: lead } = await supabase
    .from('tracked_leads')
    .select('description, address, reference, application_id')
    .eq('id', body.leadId)
    .single()

  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

  // Best-effort: pull the civils scoring reasons to sharpen the angle. Degrades
  // silently if unavailable (e.g. council no longer tracked).
  let reasons: string[] = []
  if (lead.application_id) {
    const { data: app } = await supabase
      .from('planning_applications')
      .select('score_reasons')
      .eq('id', lead.application_id)
      .single()
    reasons = (app?.score_reasons as string[] | null) ?? []
  }

  const context = [
    `Development description: ${lead.description ?? 'Not provided'}`,
    `Site address: ${lead.address ?? 'Not provided'}`,
    `Planning reference: ${lead.reference}`,
    reasons.length > 0 ? `Likely civils scope signals: ${reasons.join('; ')}` : null,
  ].filter(Boolean).join('\n')

  try {
    const anthropic = new Anthropic()  // reads ANTHROPIC_API_KEY from env
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Draft an outreach email about this planning application:\n\n${context}`,
        },
      ],
    })

    const draft = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim()

    // Record the successful generation against today's cap. Failures aren't
    // logged — a user shouldn't burn allowance on our errors.
    await supabase.from('outreach_log').insert({ user_id: user.id, lead_id: body.leadId })

    return NextResponse.json({ draft })
  } catch (err) {
    console.error('Outreach generation failed:', err)
    return NextResponse.json({ error: 'Could not generate a draft. Please try again.' }, { status: 502 })
  }
}
