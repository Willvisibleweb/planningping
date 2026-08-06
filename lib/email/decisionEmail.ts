// Decision alerts — a separate email from the new-application alert.
//
// Deliberately its own send rather than a section in the daily alert. A
// decision is a different kind of news: "something new appeared near you" is
// browsing, "the thing you were tracking just got consent" is a prompt to act
// today. Folding them together would bury the second under the first, and the
// subject line is most of the value.
//
// Written for business development, per the product's actual buyer. Refusals
// and withdrawals alert too — for a civils firm, knowing a pursuit is dead is
// worth as much as knowing one is live, and a withdrawal often signals a
// revised submission worth watching for.

import { Resend } from 'resend'
import { DECISION_COPY, type DecisionOutcome } from '@/lib/classification/decisionOutcome'
import type { PartnershipProvider } from '@/lib/features'

const FROM = 'PlanningPing <notifications@kelwave.co.uk>'
const MAX_ITEMS = 15

export interface DecisionItem {
  applicationId: string | null
  reference: string
  outcome: DecisionOutcome
  description: string | null
  address: string | null
  councilSlug: string
  decisionDate: string | null
  areaLabel: string
}

let client: Resend | null = null
function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null
  if (!client) client = new Resend(process.env.RESEND_API_KEY)
  return client
}

const TONE: Record<DecisionOutcome, { bg: string; fg: string; border: string }> = {
  approved: { bg: '#ecfdf5', fg: '#047857', border: '#a7f3d0' },
  refused: { bg: '#fef2f2', fg: '#b91c1c', border: '#fecaca' },
  withdrawn: { bg: '#f1f1f3', fg: '#55565b', border: '#e3e3e7' },
  decided: { bg: '#f5f8ff', fg: '#1e40af', border: '#d6e4fb' },
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

function renderItem(item: DecisionItem, siteUrl: string): string {
  const tone = TONE[item.outcome]
  const copy = DECISION_COPY[item.outcome]
  const href = item.applicationId ? `${siteUrl}/applications/${item.applicationId}` : `${siteUrl}/dashboard`

  return `
    <tr><td style="padding:0 0 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${tone.border};border-radius:10px;">
        <tr><td style="padding:16px 18px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td style="font-family:${MONO};font-size:12px;font-weight:600;color:#6b6c70;">${esc(item.reference)}</td>
            <td align="right">
              <span style="display:inline-block;background:${tone.bg};color:${tone.fg};font-size:11px;font-weight:700;line-height:1;padding:5px 9px;border-radius:999px;">${esc(copy.label)}</span>
            </td>
          </tr></table>
          <div style="font-family:${SANS};font-size:14px;line-height:1.5;color:#202124;margin:9px 0 0;">${esc(truncate(item.description, 170))}</div>
          ${item.address ? `<div style="font-family:${SANS};font-size:12px;line-height:1.5;color:#6b6c70;margin:6px 0 0;">${esc(item.address)}</div>` : ''}
          <div style="font-family:${SANS};font-size:12px;line-height:1.6;color:${tone.fg};margin:10px 0 0;">${esc(copy.meaning)}</div>
          <div style="margin:12px 0 0;">
            <a href="${href}" style="font-family:${SANS};font-size:12px;font-weight:600;color:#1d4ed8;text-decoration:none;">Open application &rarr;</a>
            <span style="font-family:${SANS};font-size:11px;color:#757579;margin-left:10px;">${esc(item.areaLabel)}</span>
          </div>
        </td></tr>
      </table>
    </td></tr>`
}

// Partner block, approvals only. A refusal is not a monitoring opportunity,
// and suggesting one there would read as automated noise.
function renderPartnerBlock(
  partner: PartnershipProvider | null,
  items: DecisionItem[],
  siteUrl: string,
): string {
  if (partner !== 'gabrielcam') return ''
  const approved = items.filter((i) => i.outcome === 'approved')
  if (approved.length === 0) return ''

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 0;background:#f5f8ff;border:1px solid #d6e4fb;border-radius:10px;">
      <tr><td style="padding:15px 17px;">
        <p style="margin:0;font-family:${SANS};font-size:13px;font-weight:600;color:#202124;">
          ${approved.length === 1 ? 'This site is' : `${approved.length} of these sites are`} ready for monitoring
        </p>
        <p style="margin:5px 0 0;font-family:${SANS};font-size:12px;line-height:1.6;color:#6b6c70;">
          Consent has been granted, so groundworks typically start within weeks. Open the
          application in PlanningPing to send GabrielCAM an enquiry with the site details
          already filled in.
        </p>
        <p style="margin:11px 0 0;">
          <a href="${siteUrl}/dashboard" style="font-family:${SANS};font-size:12px;font-weight:600;color:#1d4ed8;text-decoration:none;">Review approved sites &rarr;</a>
        </p>
      </td></tr>
    </table>`
}

function buildSubject(items: DecisionItem[]): string {
  const approved = items.filter((i) => i.outcome === 'approved').length

  if (items.length === 1) {
    const only = items[0]
    return `${only.reference} was ${DECISION_COPY[only.outcome].headline}`
  }
  // Lead with approvals when there are any — that's the actionable half.
  if (approved > 0) {
    return approved === items.length
      ? `${approved} tracked applications approved`
      : `${approved} of ${items.length} tracked applications approved`
  }
  return `${items.length} tracked applications decided`
}

/**
 * One decision email per user per ingest run. Returns false rather than
 * throwing on any failure, so one bad recipient can't abort the fan-out —
 * matching sendAlertEmail's contract.
 */
export async function sendDecisionEmail(opts: {
  to: string
  items: DecisionItem[]
  siteUrl: string
  partner?: PartnershipProvider | null
}): Promise<boolean> {
  const resend = getResend()
  if (!resend) {
    console.error('sendDecisionEmail skipped: RESEND_API_KEY not configured')
    return false
  }
  if (opts.items.length === 0) return false

  const siteUrl = opts.siteUrl.replace(/\/$/, '')
  const shown = opts.items.slice(0, MAX_ITEMS)
  const moreCount = opts.items.length - shown.length

  const html = `
    <div style="font-family:${SANS};max-width:600px;margin:0 auto;padding:8px;">
      <h2 style="font-size:19px;font-weight:600;letter-spacing:-.02em;color:#202124;margin:0 0 4px;">
        ${opts.items.length === 1 ? 'A tracked application has been decided' : 'Decisions on your tracked applications'}
      </h2>
      <p style="font-size:13px;line-height:1.65;color:#6b6c70;margin:0 0 18px;">
        These were decided by the planning authority since the last check.
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${shown.map((i) => renderItem(i, siteUrl)).join('')}
      </table>
      ${moreCount > 0 ? `<p style="margin:4px 0 0;"><a href="${siteUrl}/dashboard" style="color:#1d4ed8;font-size:13px;font-weight:600;text-decoration:none;">+${moreCount} more — view your dashboard &rarr;</a></p>` : ''}
      ${renderPartnerBlock(opts.partner ?? null, opts.items, siteUrl)}
      <p style="font-size:11px;line-height:1.65;color:#757579;margin:22px 0 0;">
        PlanningPing is an alerting tool, not professional advice. Always verify a decision
        against the official planning authority before acting.
      </p>
    </div>`

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: opts.to,
      subject: buildSubject(opts.items),
      html,
    })
    if (error) {
      console.error('sendDecisionEmail failed:', error)
      return false
    }
    return true
  } catch (e) {
    console.error('sendDecisionEmail threw:', e)
    return false
  }
}
