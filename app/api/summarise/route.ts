// Plain-English summary of one planning application.
//
// Council descriptions are frequently a single 400-word sentence of statutory
// clauses — "Submission of details to discharge condition No. 27 (Unidentified
// Contamination) of planning permission..." — and the thing a contractor
// actually wants to know is whether there is groundwork in it. This turns one
// of those into two or three sentences.
//
// Guardrails, because a summary is shown next to council facts:
//   - the model answers through a schema (a forced tool call), not free text,
//     and the result is validated before anything is stored;
//   - every money amount, unit count, area, duration and percentage in the
//     summary must appear in the text the model was given — an invented
//     "£4.2m" or "40 homes" is rejected and never cached;
//   - the stored summary records which model and prompt version wrote it, so
//     a prompt change can target older summaries.
//
// No tools beyond the answer schema: everything needed is on the row, so this
// is one stateless call. Model matches the chat and the outreach route.

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import * as z from 'zod/v4'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getProfile, hasTopTierAccess } from '@/lib/access'
import { positiveSignals } from '@/lib/scoring/civilsCriteria'
import { consumeAiQuota, releaseAiQuota } from '@/lib/ai/quota'
import { findUnsupportedFigures } from '@/lib/reliability/aiGuard'
import { textSimilarity } from '@/lib/reliability/duplicates'

export const maxDuration = 30

const MODEL = 'claude-haiku-4-5'
// Bump when SYSTEM or SUMMARY_TOOL changes. Stored with each summary.
const PROMPT_VERSION = 'summary-v2-2026-09-14'

// Per-user limits (10/minute, 60/day) live in consume_ai_quota — see 0030.
// Higher than the chat's: summarising is one cheap call and is meant to be used
// while skimming a list, where twenty would be restrictive.

const SYSTEM = `You explain UK planning applications to construction contractors — groundworks, drainage, civils and highways firms looking for work.

Given one application, write at most three short sentences:
1. What is actually being built or done, in plain English. Strip the statutory phrasing.
2. Whether it plausibly carries civils scope (groundworks, drainage, highways, structures) and why — or say plainly that it does not.
3. Only if the description genuinely supports it, the stage or scale.

Facts and inference:
- The application text is the only source of facts. Anything you conclude from it is inference and must read as inference ("likely", "may", "suggests").
- Never state a cost, project value, number of homes or units, floor area, site area, duration, date, developer, contractor or applicant unless it appears in the text. If the text does not give it, leave it out — do not estimate it.
- If the description is too vague to tell what is being built or whether there is civils scope, say so. That is a useful answer.
- "Our scoring matched" lists keywords our software found. They are hints, not findings — do not repeat them as facts.

Answer by calling submit_summary exactly once. No text outside the tool call.`

const SUMMARY_TOOL: Anthropic.Tool = {
  name: 'submit_summary',
  description: 'Submit the plain-English summary of this planning application.',
  input_schema: {
    type: 'object',
    properties: {
      summary: { type: 'string', description: 'At most three short sentences, no headings or bullets.' },
      civils_relevance: {
        type: 'string',
        enum: ['likely', 'possible', 'unlikely', 'unclear'],
        description: 'Whether the described works plausibly include civils scope.',
      },
      relevance_basis: {
        type: ['string', 'null'],
        description: 'Words quoted exactly from the description that support the relevance judgement, or null if none.',
      },
      insufficient_information: {
        type: 'boolean',
        description: 'True when the description is too vague to say what is being built.',
      },
    },
    required: ['summary', 'civils_relevance', 'relevance_basis', 'insufficient_information'],
  },
}

const SummarySchema = z.object({
  summary: z.string().trim().min(10).max(900),
  civils_relevance: z.enum(['likely', 'possible', 'unlikely', 'unclear']),
  relevance_basis: z.string().trim().max(400).nullable(),
  insufficient_information: z.boolean(),
})

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })

  if (!hasTopTierAccess(await getProfile())) {
    return NextResponse.json(
      { error: 'Summaries are only available on the Max plan.' },
      { status: 403 },
    )
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'Summaries are not configured.' }, { status: 503 })
  }

  let body: { applicationId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 })
  }
  if (!body.applicationId) {
    return NextResponse.json({ error: 'No application given.' }, { status: 400 })
  }

  // RLS scopes this to councils the caller actively tracks, so a forged id
  // cannot summarise an application they are not entitled to see.
  const { data: app } = await supabase
    .from('planning_applications')
    .select('reference, description, address, status, application_date, score_reasons, ai_summary')
    .eq('id', body.applicationId)
    .single()

  if (!app) return NextResponse.json({ error: 'Application not found.' }, { status: 404 })
  if (!app.description || app.description.trim().length < 20) {
    return NextResponse.json({
      summary: 'This application has no description to summarise — the council published only a reference.',
    })
  }

  // Served from cache before the quota is touched. The summary is derived
  // purely from the council's description — nothing in it is specific to the
  // person who asked — so a second viewer should neither wait for it nor spend
  // a slot on a paragraph that already exists.
  if (app.ai_summary) {
    return NextResponse.json({ summary: app.ai_summary, cached: true })
  }

  // Reserved here rather than earlier: everything above can still refuse the
  // request, and a slot taken before those checks would charge the user for a
  // summary they never got.
  const quota = await consumeAiQuota(user.id, 'summary')
  if (!quota.allowed) {
    return NextResponse.json({ error: quota.message }, { status: quota.status })
  }

  const scopes = positiveSignals(app.score_reasons as string[])
  const sourceText = [
    `Reference: ${app.reference}`,
    app.address ? `Address: ${app.address}` : null,
    app.status ? `Status: ${app.status}` : null,
    app.application_date ? `Submitted: ${app.application_date}` : null,
    '',
    `Description: ${app.description}`,
  ]
    .filter((line) => line !== null)
    .join('\n')

  try {
    const client = new Anthropic()
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 600,
      system: SYSTEM,
      tools: [SUMMARY_TOOL],
      tool_choice: { type: 'tool', name: 'submit_summary' },
      messages: [
        {
          role: 'user',
          content: [
            sourceText,
            // Given as a hint, not as fact to repeat: the scorer matched
            // keywords, which is evidence rather than a conclusion.
            scopes.length > 0 ? `\nOur scoring matched: ${scopes.join(', ')}` : '',
          ].join(''),
        },
      ],
    })

    const toolUse = message.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    const parsed = SummarySchema.safeParse(toolUse?.input)
    if (!parsed.success) {
      // Malformed output is never stored. Treated like an API failure: the
      // user keeps their slot and can try again.
      console.error('summarise: model output failed validation:', parsed.error?.message ?? 'no tool call')
      await releaseAiQuota(quota.slotId)
      return NextResponse.json({ error: 'Could not summarise this one.' }, { status: 502 })
    }

    const unsupported = findUnsupportedFigures(parsed.data.summary, [sourceText])
    if (unsupported.length > 0) {
      console.error(`summarise: rejected summary for ${app.reference} with unsupported figures: ${unsupported.join(', ')}`)
      await releaseAiQuota(quota.slotId)
      return NextResponse.json(
        { error: 'The draft summary included figures that are not in the planning record, so it was discarded. Please try again.' },
        { status: 502 },
      )
    }

    // A quoted basis that is not actually in the description is dropped
    // rather than shown as though it were.
    const basis = parsed.data.relevance_basis
    const basisSupported = basis ? textSimilarity(basis, app.description) > 0 && app.description.toLowerCase().includes(basis.toLowerCase().slice(0, 40)) : false

    const summary = parsed.data.summary
    const admin = createAdminClient()
    // Admin client because planning_applications has a SELECT policy and
    // nothing else — users cannot write this column, by design. Best-effort:
    // a failed cache write costs the next viewer a regeneration, which is not
    // worth failing a request the user already has an answer to.
    const generatedAt = new Date().toISOString()
    let cache = await admin
      .from('planning_applications')
      .update({ ai_summary: summary, ai_summary_at: generatedAt, ai_summary_model: MODEL, ai_summary_prompt_version: PROMPT_VERSION })
      .eq('id', body.applicationId)
    if (cache.error && /ai_summary_(model|prompt_version)/.test(cache.error.message)) {
      // Migration 0036 not applied yet: cache without the provenance columns.
      cache = await admin
        .from('planning_applications')
        .update({ ai_summary: summary, ai_summary_at: generatedAt })
        .eq('id', body.applicationId)
    }
    if (cache.error) console.error('summary cache write failed:', cache.error.message)

    return NextResponse.json({
      summary,
      relevance: parsed.data.civils_relevance,
      relevanceBasis: basisSupported ? basis : null,
      insufficientInformation: parsed.data.insufficient_information,
      model: MODEL,
    })
  } catch (error) {
    await releaseAiQuota(quota.slotId)

    if (error instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: 'Busy — try again in a moment.' }, { status: 429 })
    }
    if (error instanceof Anthropic.APIError) {
      console.error('summarise Anthropic error:', error.status, error.message)
      return NextResponse.json({ error: 'Could not summarise this one.' }, { status: 502 })
    }
    console.error('summarise failed:', error)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
