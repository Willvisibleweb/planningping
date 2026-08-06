// The weekly Monday digest.
//
// This is the email the landing page, signup and settings have always promised
// and nothing has ever sent. It used to live inside an n8n workflow that was
// bolted onto the old scraper; when the scraper moved to a Vercel cron the
// digest went with it and quietly stopped existing. Keeping it in the repo
// means it can't disappear again with a service.
//
// Unlike the alert emails, this one goes to everyone with a tracked area —
// homeowners included. The free tier is sold on "a weekly email digest", and
// the alert path is gated on paid access, so without this a homeowner receives
// nothing at all.

import { Resend } from 'resend'

const FROM = 'PlanningPing <notifications@kelwave.co.uk>'
const MAX_ITEMS = 8

export interface DigestItem {
  applicationId: string | null
  reference: string
  description: string | null
  address: string | null
  status: string | null
  applicationDate: string | null
  band: string | null
  areaLabel: string
}

export interface DigestPayload {
  userId: string
  email: string
  periodStart: string
  periodEnd: string
  areaCount: number
  items: DigestItem[]
}

let client: Resend | null = null
function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null
  if (!client) client = new Resend(process.env.RESEND_API_KEY)
  return client
}

const C = {
  ink: '#202124',
  muted: '#6b6c70',
  faint: '#757579',
  border: '#d6e4fb',
  sunken: '#f8f8f9',
  page: '#f1f1f3',
  brand: '#2563eb',
  brandDark: '#1d4ed8',
}
const SANS =
  "'IBM Plex Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
const MONO = "'IBM Plex Mono','SF Mono',SFMono-Regular,ui-monospace,Menlo,Consolas,monospace"

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function truncate(s: string | null, n: number): string {
  const t = (s ?? '').trim()
  return t.length <= n ? t : t.slice(0, n).replace(/\s+\S*$/, '') + '…'
}

function niceDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(`${iso}T00:00:00Z`)
  if (isNaN(d.getTime())) return esc(iso)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

// Same keyword matching and tones as lib/statusStyle.ts, so a pill in the app
// and a pill in the inbox can't disagree.
function statusPill(status: string | null): string {
  if (!status) return ''
  const s = status.toLowerCase()
  let bg = '#f1f1f3'
  let fg = '#55565b'
  if (/approv|grant|permit/.test(s)) { bg = '#ecfdf5'; fg = '#047857' }
  else if (/refus|reject|withdraw|dismiss/.test(s)) { bg = '#fef2f2'; fg = '#b91c1c' }
  else if (/pending|await|consult|valid|registered/.test(s)) { bg = '#fffbeb'; fg = '#b45309' }
  return `<span style="display:inline-block;background:${bg};color:${fg};font-size:11px;font-weight:600;line-height:1;padding:5px 9px;border-radius:999px;white-space:nowrap;">${esc(status)}</span>`
}

function bandPill(band: string | null): string {
  if (!band || band === 'COLD') return ''
  const tone = band === 'HOT' ? { bg: '#fef2f2', fg: '#b91c1c' } : { bg: '#fffbeb', fg: '#b45309' }
  return `<span style="display:inline-block;background:${tone.bg};color:${tone.fg};font-size:10px;font-weight:700;letter-spacing:.04em;line-height:1;padding:4px 7px;border-radius:999px;margin-left:6px;">${esc(band)}</span>`
}

function card(item: DigestItem, siteUrl: string): string {
  const href = item.applicationId
    ? `${siteUrl}/applications/${item.applicationId}`
    : `${siteUrl}/dashboard`
  return `
    <tr><td style="padding:0 0 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.border};border-radius:10px;">
        <tr><td style="padding:16px 18px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td style="font-family:${MONO};font-size:12px;font-weight:600;color:${C.brand};">${esc(item.reference)}${bandPill(item.band)}</td>
            <td align="right" style="font-family:${SANS};font-size:11px;color:${C.faint};white-space:nowrap;">${esc(niceDate(item.applicationDate))}</td>
          </tr></table>
          <div style="font-family:${SANS};font-size:14px;line-height:1.5;color:${C.ink};margin:8px 0 0;">${esc(truncate(item.description, 180))}</div>
          ${item.address ? `<div style="font-family:${SANS};font-size:12px;line-height:1.5;color:${C.muted};margin:6px 0 0;">${esc(item.address)}</div>` : ''}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0 0;"><tr>
            <td>${statusPill(item.status)}</td>
            <td align="right"><a href="${href}" style="font-family:${SANS};font-size:12px;font-weight:600;color:${C.brandDark};text-decoration:none;">Open application &rarr;</a></td>
          </tr></table>
          <div style="font-family:${SANS};font-size:11px;color:${C.faint};margin:8px 0 0;">${esc(item.areaLabel)}</div>
        </td></tr>
      </table>
    </td></tr>`
}

export function buildDigestHtml(d: DigestPayload, siteUrl: string): string {
  const shown = d.items.slice(0, MAX_ITEMS)
  const remaining = d.items.length - shown.length
  const n = d.items.length
  const areaWord = d.areaCount === 1 ? 'territory' : 'territories'

  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<title>Your PlanningPing digest</title></head>
<body style="margin:0;padding:0;background:${C.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${n} new application${n === 1 ? '' : 's'} across your ${d.areaCount} ${areaWord}.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page};">
  <tr><td align="center" style="padding:28px 16px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid ${C.border};border-radius:14px;">
      <tr><td style="padding:24px 26px 18px;border-bottom:1px solid ${C.border};">
        <div style="font-family:${SANS};font-size:15px;font-weight:600;letter-spacing:-.02em;color:${C.ink};">Planning<span style="color:${C.brand};">Ping</span></div>
        <div style="font-family:${SANS};font-size:20px;font-weight:600;letter-spacing:-.02em;color:${C.ink};margin:14px 0 0;">${n} new application${n === 1 ? '' : 's'} this week</div>
        <div style="font-family:${SANS};font-size:13px;line-height:1.65;color:${C.muted};margin:6px 0 0;">Across your ${d.areaCount} ${areaWord} · ${esc(niceDate(d.periodStart))} to ${esc(niceDate(d.periodEnd))}</div>
      </td></tr>
      <tr><td style="padding:20px 26px 4px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${shown.map((i) => card(i, siteUrl)).join('')}</table>
        ${remaining > 0 ? `<div style="font-family:${SANS};font-size:13px;color:${C.muted};padding:2px 0 12px;">and ${remaining} more in your dashboard.</div>` : ''}
      </td></tr>
      <tr><td style="padding:6px 26px 26px;">
        <a href="${siteUrl}/dashboard" style="display:inline-block;background:${C.brand};color:#ffffff;font-family:${SANS};font-size:14px;font-weight:500;text-decoration:none;padding:11px 18px;border-radius:6px;">Open your dashboard</a>
      </td></tr>
      <tr><td style="padding:18px 26px 22px;border-top:1px solid ${C.border};background:${C.sunken};border-radius:0 0 14px 14px;">
        <div style="font-family:${SANS};font-size:11px;line-height:1.65;color:${C.faint};">PlanningPing is an alerting tool, not professional advice. Planning data is collected from public portals and may be incomplete, delayed, or inaccurate. Always verify against the official planning authority before acting.</div>
        <div style="font-family:${SANS};font-size:11px;line-height:1.65;color:${C.faint};margin:10px 0 0;">
          <a href="${siteUrl}/settings" style="color:${C.muted};">Manage your digest</a> ·
          <a href="${siteUrl}/terms" style="color:${C.muted};">Terms</a> ·
          <a href="${siteUrl}/privacy" style="color:${C.muted};">Privacy</a>
        </div>
      </td></tr>
    </table>
  </td></tr>
</table></body></html>`
}

/**
 * Sends one digest. Returns false rather than throwing on failure, so one bad
 * recipient can't abort the run — same contract as the other senders.
 */
export async function sendDigestEmail(d: DigestPayload, siteUrl: string): Promise<boolean> {
  const resend = getResend()
  if (!resend) {
    console.error('sendDigestEmail skipped: RESEND_API_KEY not configured')
    return false
  }
  if (d.items.length === 0) return false

  const n = d.items.length
  const subject = `${n} new planning application${n === 1 ? '' : 's'} in your ${d.areaCount === 1 ? 'territory' : 'territories'}`

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: d.email,
      subject,
      html: buildDigestHtml(d, siteUrl.replace(/\/$/, '')),
    })
    if (error) {
      console.error('sendDigestEmail failed:', error)
      return false
    }
    return true
  } catch (e) {
    console.error('sendDigestEmail threw:', e)
    return false
  }
}
