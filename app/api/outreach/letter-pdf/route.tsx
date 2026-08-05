// Renders the user's already-edited letter body into a downloadable PDF.
//
// Separate from /api/outreach: this makes zero Anthropic calls (the text is
// already generated/edited client-side), so it must NOT share that route's
// daily generation cap — it's still gated on hasProAccess (real CPU cost,
// still a pro feature surface) and still verifies lead ownership via RLS.
//
// Deliberately takes only { leadId, letterBody } — NOT the opportunity brief
// (scope/valueSignal/reasoning). That's internal sales analysis for the
// engineer and must never be embedded in a document the recipient could see.

import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { createClient } from '@/lib/supabase/server'
import { getProfile, hasProAccess } from '@/lib/access'
import LetterDocument from '@/lib/pdf/LetterDocument'
import type { FirmProfile } from '@/types/database'

export const runtime = 'nodejs' // @react-pdf/renderer needs Node APIs, not Edge-compatible

function sanitizeFilename(s: string): string {
  return s.replace(/[^a-zA-Z0-9-_]/g, '_')
}

export async function POST(request: NextRequest) {
  let body: { leadId?: string; letterBody?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!body.leadId || !body.letterBody) {
    return NextResponse.json({ error: 'leadId and letterBody required' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  if (!hasProAccess(await getProfile())) {
    return NextResponse.json(
      { error: 'This feature requires an active professional plan.' },
      { status: 403 },
    )
  }

  // RLS only returns the lead if it belongs to this user.
  const { data: lead } = await supabase
    .from('tracked_leads')
    .select('reference, address')
    .eq('id', body.leadId)
    .single()
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })

  // No firm profile yet is the common first-time case — the template
  // degrades to bracketed placeholders, never a blank/crash.
  const { data: firmProfile } = await supabase
    .from('firm_profiles')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()
  const firm = firmProfile as FirmProfile | null

  let logo: { data: Buffer; format: 'png' | 'jpg' } | null = null
  if (firm?.logo_path) {
    const { data: blob } = await supabase.storage.from('firm-logos').download(firm.logo_path)
    if (blob) {
      const format = firm.logo_path.toLowerCase().endsWith('.png') ? 'png' : 'jpg'
      logo = { data: Buffer.from(await blob.arrayBuffer()), format }
    }
  }

  try {
    // The error-boundaries rule assumes React DOM, where a render error must be
    // caught by a boundary rather than a try/catch. renderToBuffer is
    // @react-pdf/renderer's imperative server-side renderer — it returns a
    // promise that rejects, so try/catch is the correct and only way to handle
    // a failure here. There is no component tree and no boundary to use.
    const pdfBuffer = await renderToBuffer(
      // eslint-disable-next-line react-hooks/error-boundaries -- server-side PDF render, not React DOM; see above
      <LetterDocument
        logo={logo}
        businessName={firm?.business_name ?? null}
        address={firm?.address ?? null}
        phone={firm?.phone ?? null}
        contactEmail={firm?.contact_email ?? null}
        reference={lead.reference}
        siteAddress={lead.address}
        letterBody={body.letterBody}
      />,
    )

    // Copied into a plain ArrayBuffer — TS's BodyInit/BlobPart types don't
    // structurally accept Node's Buffer<ArrayBufferLike> (its backing buffer
    // is typed as possibly-SharedArrayBuffer), even though it's a real
    // Uint8Array at runtime. ArrayBuffer.slice() always returns a genuine
    // (non-shared) ArrayBuffer, which satisfies both types cleanly.
    const arrayBuffer = pdfBuffer.buffer.slice(
      pdfBuffer.byteOffset,
      pdfBuffer.byteOffset + pdfBuffer.byteLength,
    ) as ArrayBuffer

    return new NextResponse(arrayBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="letter-${sanitizeFilename(lead.reference)}.pdf"`,
      },
    })
  } catch (err) {
    console.error('Letter PDF generation failed:', err)
    return NextResponse.json({ error: 'Could not generate the PDF. Please try again.' }, { status: 502 })
  }
}
