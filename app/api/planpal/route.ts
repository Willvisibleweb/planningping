// PlanPal — the dashboard assistant.
//
// Same shape as the territory chat, one scope wider: where that one is bound to
// a single council, this is bound to every council the caller tracks, plus
// their pipeline, their territory setup and the tender feed. The slug list
// comes from the caller's OWN tracked_areas and is closed over in the tools —
// the model never supplies a council, and every query runs through the
// caller's own client so RLS applies on top.
//
// Logged as kind 'chat', sharing the territory assistant's daily allowance
// rather than taking its own. One conversational budget across both assistants
// is easier to reason about than two, and it needed no migration.

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { getProfile, hasTopTierAccess } from '@/lib/access'
import { buildPlanPalTools } from '@/lib/ai/planPalTools'
import { consumeAiQuota, releaseAiQuota } from '@/lib/ai/quota'

export const maxDuration = 60

const MODEL = 'claude-haiku-4-5'

// Per-user limits (5/minute, 20/day, shared with the territory chat) live in
// consume_ai_quota — see 0030.

// Bounds one conversation's cost: every turn resends the history, so an
// unbounded thread grows quadratically in spend.
const MAX_HISTORY = 12

const SYSTEM = `You are PlanPal, the assistant inside PlanningPing. You help UK construction firms — groundworks, drainage, civils and highways contractors — find work in planning data.

How to answer:
- ALWAYS call a tool before answering anything factual. Never answer from memory and never invent an application, a reference, a council or a number.
- search_applications for specific schemes. portfolio_summary for "how am I doing overall". list_territories for their setup. pipeline_summary for what they are working. find_tenders for public sector contracts.
- Quote the application reference whenever you name a scheme, so it can be looked up.
- Be brief: two or three sentences, or a short list. These are busy people mid-job.
- Say "pipeline" ONLY for opportunities the user has actively added to their pipeline (pipeline_summary). Applications found by search_applications or counted by portfolio_summary are not in their pipeline — call them applications, schemes or opportunities.

What you must be honest about:
- PlanningPing only holds applications for councils this user tracks. There is no national dataset behind you. If asked about somewhere they do not track, say plainly that we hold no data for it and that they would need to add it as a territory — do not guess, and do not present an empty result as though nothing is happening there.
- Fit scores are automated estimates of commercial relevance, not recommendations. Say so if a user leans on them heavily.
- If a value or figure is not recorded, say it is not recorded. Never estimate one.`

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })

  if (!hasTopTierAccess(await getProfile())) {
    return NextResponse.json({ error: 'PlanPal is only available on the Max plan.' }, { status: 403 })
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'PlanPal is not configured.' }, { status: 503 })
  }

  let body: { messages?: { role: string; content: string }[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 })
  }

  const history = (body.messages ?? []).slice(-MAX_HISTORY)
  if (history.length === 0) {
    return NextResponse.json({ error: 'Nothing to answer.' }, { status: 400 })
  }

  // The caller's own territories, and nothing else. This list is the ceiling on
  // everything the tools can read.
  const { data: areas } = await supabase
    .from('tracked_areas')
    .select('council_slug')
    .eq('user_id', user.id)
    .neq('is_active', false)

  const councilSlugs = [...new Set((areas ?? []).map((a) => a.council_slug as string))]

  if (councilSlugs.length === 0) {
    // Answered without spending a slot: there is nothing for the tools to read,
    // and a model turn would only produce a longer version of this sentence.
    return NextResponse.json({
      reply:
        'You are not tracking any territories yet, so I have no planning data to look at. ' +
        'Add a territory from your dashboard and I can start answering questions about it.',
    })
  }

  // Reserved immediately before the model call, released in the catch.
  const quota = await consumeAiQuota(user.id, 'chat')
  if (!quota.allowed) {
    return NextResponse.json({ error: quota.message }, { status: quota.status })
  }

  try {
    const client = new Anthropic()
    const runner = client.beta.messages.toolRunner({
      model: MODEL,
      max_tokens: 1024,
      system: `${SYSTEM}\n\nThis user tracks ${councilSlugs.length} ${councilSlugs.length === 1 ? 'council' : 'councils'}: ${councilSlugs.join(', ')}.`,
      tools: buildPlanPalTools(supabase, user.id, councilSlugs),
      messages: history.map((m) => ({
        role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
        content: String(m.content).slice(0, 2000),
      })),
    })

    const final = await runner.runUntilDone()

    const text = final.content
      .flatMap((block) => (block.type === 'text' ? [block.text] : []))
      .join('\n')
      .trim()

    return NextResponse.json({
      reply: text || 'I could not find an answer to that in your territories.',
    })
  } catch (error) {
    // Hand the slot back — our failure should not cost the user a question.
    await releaseAiQuota(quota.slotId)

    if (error instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: 'Busy — try again in a moment.' }, { status: 429 })
    }
    if (error instanceof Anthropic.APIError) {
      console.error('planpal Anthropic error:', error.status, error.message)
      return NextResponse.json({ error: 'PlanPal could not answer that.' }, { status: 502 })
    }
    console.error('planpal failed:', error)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
