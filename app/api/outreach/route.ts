// AI outreach draft generator (Task 4).
//
// Given a tracked lead, produces an opportunity brief (likely civils scope,
// a rough value/complexity signal, and plain-English reasoning) plus either
// 2-3 alternate outreach-email angles (mode: 'email', default) or one formal
// letter body (mode: 'letter', paired with app/api/outreach/letter-pdf for
// download) — "mission-first": everything is inferred from the application's
// description (e.g. an agricultural conversion → Class Q civils scope).
//
// Both modes share auth/rate-limit/lead-fetch scaffolding and only branch on
// the tool schema + system-prompt tail — kept in one route rather than two so
// that scaffolding (which is most of this file) can't drift out of sync.
//
// Server-side only. The Anthropic API key never reaches the browser. Auth is the
// Supabase session, and RLS guarantees the lead belongs to the caller.
//
// Model: Claude Haiku 4.5 — fast and cheap, which suits short drafts generated
// during customer validation. To swap models later, change MODEL below.
//
// LLM SEAM: this is a single, stateless generation (one tool-forced call
// returns brief + draft together, so it stays one Anthropic request and one
// daily-cap unit). If quality needs to improve, raise the model (e.g.
// claude-opus-4-8) or enrich the prompt with more lead context — no
// structural change required.

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { getProfile, hasProAccess } from '@/lib/access'

const MODEL = 'claude-haiku-4-5'

// Per-user daily cap on draft generation, shared across both modes. Each call
// costs Anthropic credits, so this bounds the worst case (e.g. a trial user
// generating in a loop). Counted per UTC day via outreach_log (migration 0007).
const DAILY_LIMIT = 20

const BRIEF_FIELDS = `- Infer the likely civils scope from the development described (e.g. drainage/SuDS, groundworks/earthworks, highways/S278, structural/retaining, flood mitigation, an agricultural Class Q conversion, etc.). If the description is vague, keep it general rather than guessing specifics.
- "value_signal" is a short, honest phrase on project size/complexity (e.g. "Small single dwelling — modest, one-off scope" or "Multi-unit residential — larger, multi-phase civils scope"). Don't invent figures; work from what the description and application type imply.
- "reasoning" is 1-2 plain-English sentences a busy engineer can read in three seconds: why this is (or isn't strongly) worth pursuing.`

const EMAIL_SYSTEM_PROMPT = `You are a business-development analyst for a UK civil engineering firm, reviewing a planning application as a potential lead.

Rules:
${BRIEF_FIELDS}
- Produce 2-3 distinct outreach angles (e.g. leading with drainage risk, leading with programme/timeline, leading with cost-saving) — each a short, warm, direct email under ~150 words, with a subject line and body. Use [Your name] / [Firm] placeholders — do not invent contact details.
- Call the submit_outreach tool exactly once with your analysis. No commentary outside the tool call.`

const LETTER_SYSTEM_PROMPT = `You are a business-development analyst for a UK civil engineering firm, reviewing a planning application as a potential lead, drafting a formal letter to be printed and posted.

Rules:
${BRIEF_FIELDS}
- Draft ONE formal letter, ~200-300 words. There is no applicant/agent name available — open with "Dear Sir/Madam," and close with "Yours faithfully," (the correct UK pairing when the recipient isn't named — never invent a name). Use [Your name] / [Firm] placeholders for the signature — do not invent contact details.
- Formal register throughout (this is a printed, posted letter, not an email) — no subject line, no informal phrasing.
- Call the submit_letter tool exactly once with your analysis. No commentary outside the tool call.`

const OUTREACH_TOOL: Anthropic.Tool = {
  name: 'submit_outreach',
  description: 'Submit the opportunity brief and outreach email angles for this planning application lead.',
  input_schema: {
    type: 'object',
    properties: {
      scope: { type: 'string', description: 'Likely civils scope in one short phrase, e.g. "Drainage & SuDS"' },
      value_signal: { type: 'string', description: 'One short honest phrase on project size/complexity' },
      reasoning: { type: 'string', description: '1-2 plain-English sentences on why this is worth pursuing' },
      angles: {
        type: 'array',
        minItems: 2,
        maxItems: 3,
        items: {
          type: 'object',
          properties: {
            label: { type: 'string', description: 'Short label for this angle, e.g. "Lead with drainage risk"' },
            subject: { type: 'string' },
            body: { type: 'string' },
          },
          required: ['label', 'subject', 'body'],
        },
      },
    },
    required: ['scope', 'value_signal', 'reasoning', 'angles'],
  },
}

const LETTER_TOOL: Anthropic.Tool = {
  name: 'submit_letter',
  description: 'Submit the opportunity brief and formal letter body for this planning application lead.',
  input_schema: {
    type: 'object',
    properties: {
      scope: { type: 'string', description: 'Likely civils scope in one short phrase, e.g. "Drainage & SuDS"' },
      value_signal: { type: 'string', description: 'One short honest phrase on project size/complexity' },
      reasoning: { type: 'string', description: '1-2 plain-English sentences on why this is worth pursuing' },
      letter_body: { type: 'string', description: 'The full formal letter body, "Dear Sir/Madam," through "Yours faithfully,"' },
    },
    required: ['scope', 'value_signal', 'reasoning', 'letter_body'],
  },
}

interface BriefToolInput {
  scope: string
  value_signal: string
  reasoning: string
}

interface OutreachToolInput extends BriefToolInput {
  angles: { label: string; subject: string; body: string }[]
}

interface LetterToolInput extends BriefToolInput {
  letter_body: string
}

export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'Outreach is not configured (missing ANTHROPIC_API_KEY).' },
      { status: 503 },
    )
  }

  let body: { leadId?: string; mode?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!body.leadId) return NextResponse.json({ error: 'leadId required' }, { status: 400 })
  const mode: 'email' | 'letter' = body.mode === 'letter' ? 'letter' : 'email'

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
    const toolName = mode === 'letter' ? 'submit_letter' : 'submit_outreach'
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1536,
      system: mode === 'letter' ? LETTER_SYSTEM_PROMPT : EMAIL_SYSTEM_PROMPT,
      tools: [mode === 'letter' ? LETTER_TOOL : OUTREACH_TOOL],
      tool_choice: { type: 'tool', name: toolName },
      messages: [
        {
          role: 'user',
          content: `Analyse this planning application as a lead and draft ${mode === 'letter' ? 'a formal letter' : 'outreach angles'}:\n\n${context}`,
        },
      ],
    })

    const toolUse = message.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    if (!toolUse) throw new Error(`Model did not call ${toolName}`)

    // Record the successful generation against today's shared cap. Failures
    // aren't logged — a user shouldn't burn allowance on our errors.
    await supabase.from('outreach_log').insert({ user_id: user.id, lead_id: body.leadId, kind: mode })

    if (mode === 'letter') {
      const result = toolUse.input as LetterToolInput
      return NextResponse.json({
        brief: { scope: result.scope, valueSignal: result.value_signal, reasoning: result.reasoning },
        letterBody: result.letter_body,
      })
    }

    const result = toolUse.input as OutreachToolInput
    return NextResponse.json({
      brief: { scope: result.scope, valueSignal: result.value_signal, reasoning: result.reasoning },
      angles: result.angles,
    })
  } catch (err) {
    console.error('Outreach generation failed:', err)
    return NextResponse.json({ error: 'Could not generate a draft. Please try again.' }, { status: 502 })
  }
}
