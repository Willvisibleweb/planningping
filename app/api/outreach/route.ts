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
import { consumeAiQuota, releaseAiQuota } from '@/lib/ai/quota'

const MODEL = 'claude-haiku-4-5'

// Per-user limits (5/minute, 20/day, shared across both modes) live in
// consume_ai_quota — see 0030. Each call costs Anthropic credits, so this
// bounds the worst case, e.g. a trial user generating in a loop.

const BRIEF_FIELDS = `- Infer the likely civils scope from the development described (e.g. drainage/SuDS, groundworks/earthworks, highways/S278, structural/retaining, flood mitigation, an agricultural Class Q conversion, etc.). If the description is vague, keep it general rather than guessing specifics.
- "value_signal" is a short, honest phrase on project size/complexity (e.g. "Small single dwelling — modest, one-off scope" or "Multi-unit residential — larger, multi-phase civils scope"). Don't invent figures; work from what the description and application type imply.
- "reasoning" is 1-2 plain-English sentences a busy engineer can read in three seconds: why this is (or isn't strongly) worth pursuing.`

const EMAIL_SYSTEM_PROMPT = `You are a business-development analyst for a UK civil engineering firm, reviewing a planning application as a potential lead.

Rules:
${BRIEF_FIELDS}
- Produce 2-3 distinct outreach angles (e.g. leading with drainage risk, leading with programme/timeline, leading with cost-saving) — each a short, warm, direct email under ~150 words, with a subject line and body. Use [Your name] / [Firm] placeholders — do not invent contact details.
- The context may name the agent/architect who submitted the application, and the council's target decision date. Both are public record and may inform the angle — but use them lightly. An email that opens by reciting what you know about the reader's own project reads as scraped, not researched. Never invent an individual's name; the agent is a company.
- Call the submit_outreach tool exactly once with your analysis. No commentary outside the tool call.`

const LETTER_SYSTEM_PROMPT = `You are a business-development analyst for a UK civil engineering firm, reviewing a planning application as a potential lead, drafting a formal letter to be printed and posted.

Rules:
${BRIEF_FIELDS}
- Draft ONE formal letter, ~200-300 words. Always open "Dear Sir/Madam," and close "Yours faithfully," — the correct UK pairing when no individual is named. The context may give an agent/architect, but that is a COMPANY, never a person, so it must not be used as a salutation and a person's name must never be invented. Where the agent is known you may refer to the firm naturally in the body (e.g. acknowledging they are handling the application); where it isn't, say nothing about who submitted it.
- If a target decision date is given you may refer to the determination timeline, since it is public record. Do not manufacture urgency around it.
- Use [Your name] / [Firm] placeholders for the signature — do not invent contact details.
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


  const { data: lead } = await supabase
    .from('tracked_leads')
    .select('description, address, reference, application_id')
    .eq('id', body.leadId)
    .single()

  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

  // Best-effort: pull the civils scoring reasons to sharpen the angle. Degrades
  // silently if unavailable (e.g. council no longer tracked).
  let reasons: string[] = []
  let agentCompany: string | null = null
  let targetDecisionDate: string | null = null
  if (lead.application_id) {
    const { data: app } = await supabase
      .from('planning_applications')
      .select('score_reasons, agent_company, target_decision_date')
      .eq('id', lead.application_id)
      .single()
    reasons = (app?.score_reasons as string[] | null) ?? []
    agentCompany = (app?.agent_company as string | null) ?? null
    targetDecisionDate = (app?.target_decision_date as string | null) ?? null
  }

  // The agent and the decision date are the two facts that turn a generic
  // approach into a specific one: who actually submitted the scheme, and how
  // long there is before it's determined. Both are stated as facts the model
  // may use — not instructions to name-drop, since an email that leans on
  // knowing the reader's firm reads as scraped rather than researched.
  const context = [
    `Development description: ${lead.description ?? 'Not provided'}`,
    `Site address: ${lead.address ?? 'Not provided'}`,
    `Planning reference: ${lead.reference}`,
    agentCompany ? `Submitted by (agent/architect): ${agentCompany}` : null,
    targetDecisionDate ? `Council's target decision date: ${targetDecisionDate}` : null,
    reasons.length > 0 ? `Likely civils scope signals: ${reasons.join('; ')}` : null,
  ].filter(Boolean).join('\n')

  // Reserved immediately before the model call, and released in the catch.
  // Everything above can still refuse the request, and a slot taken earlier
  // would charge the user for a draft they never got.
  //
  // Previously this counted rows and then inserted one — two statements, so
  // concurrent requests all read the same count and all passed. 0030 does the
  // check and the insert in one locked transaction, and adds a per-minute
  // burst limit on top of the daily cap.
  const quota = await consumeAiQuota(user.id, mode, body.leadId)
  if (!quota.allowed) {
    return NextResponse.json({ error: quota.message }, { status: quota.status })
  }

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
    // Hand the slot back — our failure should not cost the user a draft.
    await releaseAiQuota(quota.slotId)

    console.error('Outreach generation failed:', err)
    return NextResponse.json({ error: 'Could not generate a draft. Please try again.' }, { status: 502 })
  }
}
