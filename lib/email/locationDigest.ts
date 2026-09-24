// The weekly email promised on every public location page.
//
// The form says: "A free weekly email of new applications here, scored for
// civils scope — drainage, highways, groundworks and structures. Unsubscribe
// anytime." This is the thing that makes that true, so it sends exactly that:
// applications from the last week in that place, only the ones our scoring
// rates as civils-relevant, and an unsubscribe link that works.
//
// Recipients have no account, so the link is signed with a location subject
// rather than a user id — see lib/email/unsubscribe.ts. They are also, by
// definition, not customers yet: the email is written to be worth reading on
// its own, not as a nag to sign up.

import { Resend } from 'resend'
import { emailFrom, emailReplyTo } from '@/lib/email/from'
import { locationSubject, unsubscribeHeaders, unsubscribePageUrl } from '@/lib/email/unsubscribe'

let client: Resend | null = null
function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null
  if (!client) client = new Resend(process.env.RESEND_API_KEY)
  return client
}

export interface LocationDigestItem {
  reference: string
  councilSlug: string
  address: string | null
  description: string | null
  band: string | null
}

export interface LocationDigestPayload {
  to: string
  subscriptionId: string
  placeName: string
  /** Path on the site for this place, e.g. /planning-applications/coventry */
  placePath: string
  items: LocationDigestItem[]
  /** Applications in the week that did NOT clear the relevance filter. */
  filteredOut: number
  periodStart: string
  periodEnd: string
}

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function day(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' })
    .format(new Date(iso))
}

const BAND_COLOUR: Record<string, string> = { HOT: '#b91c1c', WARM: '#b45309' }

export function buildLocationDigestHtml(d: LocationDigestPayload, siteUrl: string): string {
  const base = siteUrl.replace(/\/$/, '')
  const rows = d.items
    .map(
      (i) => `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;">
          <div style="font-size:11px;font-weight:700;letter-spacing:.04em;color:${BAND_COLOUR[i.band ?? ''] ?? '#6b6c70'};">
            ${esc(i.band ?? 'SCORED')}
          </div>
          <div style="font-size:14px;font-weight:600;color:#202124;margin-top:3px;">${esc(i.address ?? i.reference)}</div>
          <div style="font-size:13px;line-height:1.5;color:#55565b;margin-top:4px;">${esc(i.description ?? '')}</div>
          <div style="font-size:12px;color:#6b6c70;margin-top:5px;">${esc(i.reference)}</div>
        </td>
      </tr>`,
    )
    .join('')

  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
    <div style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#6b6c70;">
      ${esc(day(d.periodStart))} – ${esc(day(d.periodEnd))}
    </div>
    <h1 style="font-size:20px;line-height:1.3;color:#202124;margin:8px 0 6px;">
      ${d.items.length} ${d.items.length === 1 ? 'scheme' : 'schemes'} worth a look in ${esc(d.placeName)}
    </h1>
    <p style="font-size:14px;line-height:1.6;color:#55565b;margin:0 0 20px;">
      New planning applications scored for civils scope — drainage, highways,
      groundworks and structures.${
        d.filteredOut > 0
          ? ` We left out ${d.filteredOut} other ${d.filteredOut === 1 ? 'application' : 'applications'} that looked like householder or tree work.`
          : ''
      }
    </p>

    <table style="width:100%;border-collapse:collapse;">${rows}</table>

    <p style="font-size:13px;line-height:1.6;color:#55565b;margin:22px 0 0;">
      <a href="${base}${esc(d.placePath)}" style="color:#2563eb;">See everything in ${esc(d.placeName)}</a>
      — or <a href="${base}/signup" style="color:#2563eb;">track your own patch</a> to get these as they land
      rather than weekly.
    </p>

    <p style="font-size:11px;line-height:1.6;color:#8e8f93;margin:26px 0 0;border-top:1px solid #e5e7eb;padding-top:14px;">
      You asked for this on a PlanningPing page for ${esc(d.placeName)}. Data comes from
      the council's public planning register.
      <a href="${unsubscribePageUrl(base, locationSubject(d.subscriptionId))}" style="color:#6b6c70;">Unsubscribe</a>.
    </p>
  </div>`
}

export async function sendLocationDigest(d: LocationDigestPayload, siteUrl: string): Promise<boolean> {
  const resend = getResend()
  if (!resend) return false
  const base = siteUrl.replace(/\/$/, '')

  try {
    const { error } = await resend.emails.send({
      from: emailFrom(),
      replyTo: emailReplyTo(),
      to: d.to,
      subject: `${d.items.length} new ${d.items.length === 1 ? 'scheme' : 'schemes'} in ${d.placeName}`,
      html: buildLocationDigestHtml(d, base),
      headers: unsubscribeHeaders(base, locationSubject(d.subscriptionId)),
    })
    if (error) {
      console.error('sendLocationDigest failed:', error)
      return false
    }
    return true
  } catch (e) {
    console.error('sendLocationDigest threw:', e)
    return false
  }
}
