// Plain-English summary of one planning application.
//
// Council descriptions are frequently a single 400-word sentence of statutory
// clauses — "Submission of details to discharge condition No. 27 (Unidentified
// Contamination) of planning permission..." — and the thing a contractor
// actually wants to know is whether there is groundwork in it. This turns one
// of those into two sentences.
//
// No tools: everything needed is on the row, so this is one stateless call.
// Model matches the chat and the outreach route.

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { getProfile, hasProAccess } from '@/lib/access'
import { positiveSignals } from '@/lib/scoring/civilsCriteria'

export const maxDuration = 30

const MODEL = 'claude-haiku-4-5'

// Higher than the chat's cap: summarising is one cheap call and is meant to be
// used while skimming a list, where twenty would be restrictive.
const DAILY_LIMIT = 60

const SYSTEM = `You explain UK planning applications to construction contractors — groundworks, drainage, civils and highways firms looking for work.

Given one application, write at most three short sentences:
1. What is actually being built or done, in plain English. Strip the statutory phrasing.
2. Whether it plausibly carries civils scope (groundworks, drainage, highways, structures) and why — or say plainly that it does not.
3. Only if the description genuinely supports it, the stage or scale.

Rules:
- Work only from the text given. Never invent units, values, timescales or parties.
- If the description is too vague to tell, say so. That is a useful answer.
- No preamble, no bullet points, no headings. Just the sentences.`

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })

  if (!hasProAccess(await getProfile())) {
    return NextResponse.json({ error: 'Summaries require an active plan.' }, { status: 403 })
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

  const startOfDay = new Date()
  startOfDay.setUTCHours(0, 0, 0, 0)
  const { count } = await supabase
    .from('outreach_log')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('kind', 'summary')
    .gte('created_at', startOfDay.toISOString())

  if ((count ?? 0) >= DAILY_LIMIT) {
    return NextResponse.json(
      { error: `Daily limit reached (${DAILY_LIMIT} summaries).` },
      { status: 429 },
    )
  }

  // RLS scopes this to councils the caller actively tracks, so a forged id
  // cannot summarise an application they are not entitled to see.
  const { data: app } = await supabase
    .from('planning_applications')
    .select('reference, description, address, status, application_date, score_reasons')
    .eq('id', body.applicationId)
    .single()

  if (!app) return NextResponse.json({ error: 'Application not found.' }, { status: 404 })
  if (!app.description || app.description.trim().length < 20) {
    return NextResponse.json({
      summary: 'This application has no description to summarise — the council published only a reference.',
    })
  }

  const scopes = positiveSignals(app.score_reasons as string[])

  try {
    const client = new Anthropic()
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 300,
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            `Reference: ${app.reference}`,
            app.address ? `Address: ${app.address}` : null,
            app.status ? `Status: ${app.status}` : null,
            app.application_date ? `Submitted: ${app.application_date}` : null,
            // Given as a hint, not as fact to repeat: the scorer matched
            // keywords, which is evidence rather than a conclusion.
            scopes.length > 0 ? `Our scoring matched: ${scopes.join(', ')}` : null,
            '',
            `Description: ${app.description}`,
          ]
            .filter(Boolean)
            .join('\n'),
        },
      ],
    })

    const summary = message.content
      .flatMap((b) => (b.type === 'text' ? [b.text] : []))
      .join('\n')
      .trim()

    await supabase.from('outreach_log').insert({ user_id: user.id, kind: 'summary' })

    return NextResponse.json({ summary: summary || 'Could not summarise this one.' })
  } catch (error) {
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
