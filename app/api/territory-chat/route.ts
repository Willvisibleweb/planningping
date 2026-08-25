// Territory assistant — ask questions about one tracked area.
//
// Server-side only: the Anthropic key never reaches the browser, auth is the
// Supabase session, and every tool query runs through the caller's own client
// so RLS applies. The council is resolved from the user's OWN tracked_areas
// row and bound into the tools at construction — the model never supplies it,
// so no prompt can talk the assistant into reading a territory the caller does
// not track.
//
// Model: Claude Haiku 4.5, matching the outreach route. Chosen deliberately for
// cost: roughly $0.008 a turn against $0.04 on Opus, and at a 20-turn daily cap
// that is about $5.70 a month per user rather than $30 — a material share of a
// £49 subscription. Change MODEL below if answer quality proves the limit.
//
// Uses the SDK's tool runner rather than a hand-written loop, so tool calls,
// results and continuation are handled by the SDK.

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { getProfile, hasProAccess } from '@/lib/access'
import { buildTerritoryTools } from '@/lib/ai/territoryTools'

export const maxDuration = 60

const MODEL = 'claude-haiku-4-5'
const DAILY_LIMIT = 20

// Bounds one conversation's cost. Every turn resends the history, so an
// unbounded thread grows quadratically in spend — and a territory question
// that needs thirty turns is one the assistant is failing to answer anyway.
const MAX_HISTORY = 12

const SYSTEM = `You are a research assistant inside PlanningPing, helping a UK construction firm work a tracked territory.

The people asking are groundworks, drainage, civils and highways contractors looking for work they could bid for.

How to answer:
- ALWAYS call a tool before answering anything factual. Never answer from memory or invent an application.
- Use filter_applications for questions about specific schemes; territory_summary for questions about the area overall.
- Quote the application reference when you name a scheme, so it can be looked up.
- Be brief. Two or three sentences, or a short list. These are busy people.
- Fit bands mean: HOT = strong match, WARM = worth reviewing, COLD = low priority. Say the words, not the codes.
- If a tool returns nothing, say so plainly and suggest a wider filter. Never fill a gap with a plausible-sounding example.
- If a count came back capped, say "at least N" rather than stating it as the total.
- You cannot see documents, drawings or anything not in the tool results. Say so if asked.`

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })

  if (!hasProAccess(await getProfile())) {
    return NextResponse.json(
      { error: 'The territory assistant requires an active plan.' },
      { status: 403 },
    )
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'Assistant is not configured.' }, { status: 503 })
  }

  let body: { areaId?: string; messages?: { role: string; content: string }[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 })
  }

  const history = (body.messages ?? []).slice(-MAX_HISTORY)
  if (!body.areaId || history.length === 0) {
    return NextResponse.json({ error: 'Nothing to answer.' }, { status: 400 })
  }

  // The territory must be the caller's. RLS would scope this anyway; failing
  // here returns an honest "not found" rather than an assistant that answers
  // about an empty council.
  const { data: area } = await supabase
    .from('tracked_areas')
    .select('label, council_slug, postcode')
    .eq('id', body.areaId)
    .eq('user_id', user.id)
    .single()

  if (!area) return NextResponse.json({ error: 'Territory not found.' }, { status: 404 })

  // Counted per kind, so chatting does not consume the outreach allowance.
  const startOfDay = new Date()
  startOfDay.setUTCHours(0, 0, 0, 0)
  const { count } = await supabase
    .from('outreach_log')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('kind', 'chat')
    .gte('created_at', startOfDay.toISOString())

  if ((count ?? 0) >= DAILY_LIMIT) {
    return NextResponse.json(
      { error: `Daily limit reached (${DAILY_LIMIT} questions). Try again tomorrow.` },
      { status: 429 },
    )
  }

  try {
    const client = new Anthropic()
    const runner = client.beta.messages.toolRunner({
      model: MODEL,
      max_tokens: 1024,
      system: `${SYSTEM}\n\nThe territory is "${area.label}" (${area.postcode}), covered by the ${area.council_slug.replace(/-/g, ' ')} planning authority.`,
      tools: buildTerritoryTools(supabase, area.council_slug),
      messages: history.map((m) => ({
        role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
        content: String(m.content).slice(0, 2000),
      })),
    })

    // runUntilDone drives the request → execute tool → send result loop
    // until Claude stops asking for tools, then returns the final message.
    const final = await runner.runUntilDone()

    const text = final.content
      .flatMap((block) => (block.type === 'text' ? [block.text] : []))
      .join('\n')
      .trim()

    // Logged after a successful answer, not before: a failed call costs the
    // user nothing and should not burn their allowance.
    await supabase.from('outreach_log').insert({ user_id: user.id, kind: 'chat' })

    return NextResponse.json({
      reply: text || 'I could not find an answer to that in this territory.',
    })
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return NextResponse.json(
        { error: 'The assistant is busy. Try again in a moment.' },
        { status: 429 },
      )
    }
    if (error instanceof Anthropic.APIError) {
      console.error('territory-chat Anthropic error:', error.status, error.message)
      return NextResponse.json({ error: 'The assistant could not answer.' }, { status: 502 })
    }
    console.error('territory-chat failed:', error)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
