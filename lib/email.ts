// Real-time-ish alert emails — one per user per daily ingest run, listing
// genuinely new applications that clear that territory's relevance filter.
//
// This is the first app-side email sender in the codebase. The existing
// periodic digest is sent entirely by n8n directly against Resend's HTTP API
// (see n8n/live.local.json, "Send Email via Resend") — that stays untouched.
// This is a separate, cron-triggered send for the new alerts feature.
//
// Server-side only. Guards on a missing key rather than throwing, so an
// unconfigured/misconfigured RESEND_API_KEY can't fail the whole ingest cron
// (mirrors the ANTHROPIC_API_KEY guard in app/api/outreach/route.ts).

import { Resend } from 'resend'

const FROM = 'PlanningPing <notifications@kelwave.co.uk>'
const MAX_ITEMS = 15

const BAND_COLOR: Record<string, { text: string; bg: string; border: string }> = {
  HOT: { text: '#b91c1c', bg: '#fef2f2', border: '#fecaca' },
  WARM: { text: '#b45309', bg: '#fffbeb', border: '#fde68a' },
  COLD: { text: '#475569', bg: '#f8fafc', border: '#e2e8f0' },
}

export interface AlertItem {
  areaLabel: string
  reference: string
  band: string | null
  description: string | null
  address: string | null
  councilSlug: string
  // Optional — used by the discharge-of-condition alert path (kept in this
  // same AlertItem/sendAlertEmail rather than a parallel email type). kind
  // is informational only; note, when set, renders as a one-line callout
  // above the description (e.g. "Discharge of condition submitted against
  // your tracked application 25/00759/PFUL3").
  kind?: 'match' | 'discharge_match' | 'discharge_stale'
  note?: string | null
}

let client: Resend | null = null

function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null
  if (!client) client = new Resend(process.env.RESEND_API_KEY)
  return client
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

function renderItem(item: AlertItem): string {
  const band = item.band ?? 'COLD'
  const colors = BAND_COLOR[band] ?? BAND_COLOR.COLD
  const desc = item.description ? escapeHtml(item.description) : 'No description'
  const address = item.address ? `<p style="margin:2px 0 0;font-size:12px;color:#6B6C70;">${escapeHtml(item.address)}</p>` : ''
  const note = item.note
    ? `<p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#2563EB;">${escapeHtml(item.note)}</p>`
    : ''
  return `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #E9F0FD;">
        ${note}
        <span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;color:${colors.text};background:${colors.bg};border:1px solid ${colors.border};">${band}</span>
        <span style="font-size:12px;color:#A0A1A6;margin-left:6px;">${escapeHtml(item.areaLabel)}</span>
        <p style="margin:6px 0 0;font-size:14px;color:#202124;">${desc}</p>
        ${address}
      </td>
    </tr>`
}

// Sends one email listing up to MAX_ITEMS new matching applications, with a
// "+N more" link to the dashboard when there are more than that. Returns
// false (does not throw) on any failure — a single user's send failing
// should never abort the rest of the cron's fan-out.
export async function sendAlertEmail(opts: {
  to: string
  items: AlertItem[]
  siteUrl: string
}): Promise<boolean> {
  const resend = getResend()
  if (!resend) {
    console.error('sendAlertEmail skipped: RESEND_API_KEY not configured')
    return false
  }

  const shown = opts.items.slice(0, MAX_ITEMS)
  const moreCount = opts.items.length - shown.length
  const dashboardUrl = `${opts.siteUrl.replace(/\/$/, '')}/dashboard`

  const html = `
    <div style="font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;">
      <h2 style="font-size:18px;color:#202124;">New planning applications matching your territories</h2>
      <table style="width:100%;border-collapse:collapse;">
        ${shown.map(renderItem).join('')}
      </table>
      ${moreCount > 0 ? `<p style="margin-top:16px;"><a href="${dashboardUrl}" style="color:#2563EB;font-size:13px;font-weight:600;text-decoration:none;">+${moreCount} more — view your dashboard &rarr;</a></p>` : ''}
      <p style="margin-top:24px;"><a href="${dashboardUrl}" style="color:#2563EB;font-size:13px;text-decoration:none;">Open PlanningPing &rarr;</a></p>
    </div>`

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: opts.to,
      subject: opts.items.length === 1
        ? '1 new planning application matching your territories'
        : `${opts.items.length} new planning applications matching your territories`,
      html,
    })
    if (error) {
      console.error('sendAlertEmail failed:', error)
      return false
    }
    return true
  } catch (e) {
    console.error('sendAlertEmail threw:', e)
    return false
  }
}
