// Proactive reliability alerts for the ingest pipeline.
//
// The public health endpoint is intentionally terse and unauthenticated. This
// module is the private counterpart: it reads full source health with the
// service role, emails the admin allowlist when the pipeline is unhealthy, and
// records a dedupe event so the same failure does not spam every caller.

import { Resend } from 'resend'
import { adminEmails } from '@/lib/admin'
import { getGlobalIngestFreshness, STALE_AFTER_HOURS } from '@/lib/health/ingestFreshness'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadHealthReport, type HealthReport, type SourceHealthRow } from '@/lib/reliability/healthReport'
import { logPipelineEvent } from '@/lib/reliability/pipelineLog'
import { severityOf } from '@/lib/reliability/sourceHealth'

const FROM = 'PlanningPing <notifications@kelwave.co.uk>'
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://planningping.com').replace(/\/$/, '')
const DEFAULT_COOLDOWN_HOURS = 18
const DEFAULT_ALERT_EMAIL = 'william.kelwave@gmail.com'
const MAX_SOURCES = 8

let client: Resend | null = null

function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null
  if (!client) client = new Resend(process.env.RESEND_API_KEY)
  return client
}

function recipients(): string[] {
  const explicit = (process.env.HEALTH_ALERT_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  const configured = explicit.length > 0 ? explicit : [...adminEmails()]
  return [...new Set(configured.length > 0 ? configured : [DEFAULT_ALERT_EMAIL])]
}

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function when(iso: string | null | undefined): string {
  if (!iso) return 'never'
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/London',
  }).format(new Date(iso))
}

function topProblemSources(report: HealthReport): SourceHealthRow[] {
  return report.sources
    .filter((s) => severityOf(s.status) >= severityOf('degraded'))
    .sort((a, b) => severityOf(b.status) - severityOf(a.status) || a.label.localeCompare(b.label))
    .slice(0, MAX_SOURCES)
}

function healthFingerprint(opts: {
  stale: boolean
  report: HealthReport
  sources: SourceHealthRow[]
}): string {
  const stuckIds = opts.report.stuckRuns.map((r) => r.id).sort().join(',')
  const sourceBits = opts.sources
    .map((s) => `${s.sourceKey}:${s.status}:${s.consecutiveFailures}:${s.lastAttemptAt ?? 'never'}`)
    .sort()
    .join('|')
  return [
    opts.stale ? 'stale' : 'fresh',
    opts.report.ingestOverdue ? 'overdue' : 'on-time',
    `failed:${opts.report.counts.failed}`,
    `degraded:${opts.report.counts.degraded}`,
    `stuck:${stuckIds}`,
    sourceBits,
  ].join('::')
}

async function alreadyNotified(
  db: ReturnType<typeof createAdminClient>,
  fingerprint: string,
  cooldownHours: number,
): Promise<boolean> {
  const since = new Date(Date.now() - cooldownHours * 3_600_000).toISOString()
  const { data, error } = await db
    .from('pipeline_events')
    .select('detail')
    .eq('job', 'health_check')
    .eq('stage', 'notify')
    .gte('occurred_at', since)
    .order('occurred_at', { ascending: false })
    .limit(25)
  if (error) return false
  return (data ?? []).some((row) => {
    const detail = (row.detail ?? {}) as Record<string, unknown>
    return detail.fingerprint === fingerprint
  })
}

function renderHtml(opts: {
  status: 'stale' | 'degraded'
  hoursSinceLastFetch: number | null
  staleAreas: number
  totalAreas: number
  report: HealthReport
  sources: SourceHealthRow[]
}): string {
  const report = opts.report
  const sourcesHtml = opts.sources.length === 0
    ? '<p style="margin:0;color:#6b6c70;">No individual failed/degraded source rows were available.</p>'
    : `<table style="width:100%;border-collapse:collapse;margin-top:10px;">
        ${opts.sources.map((s) => `
          <tr>
            <td style="padding:10px 0;border-top:1px solid #e5e7eb;">
              <div style="font-size:13px;font-weight:700;color:#202124;">${esc(s.label)} <span style="font-weight:600;color:#b91c1c;">${esc(s.status)}</span></div>
              <div style="font-size:12px;line-height:1.5;color:#6b6c70;">${esc(s.sourceKey)} · last attempt ${esc(when(s.lastAttemptAt))} · last success ${esc(when(s.lastSuccessAt))}</div>
              <div style="font-size:12px;line-height:1.5;color:#6b6c70;">${esc(s.reasons.join(' · ') || 'No reason recorded')}</div>
            </td>
          </tr>
        `).join('')}
      </table>`

  const stuckHtml = report.stuckRuns.length === 0
    ? ''
    : `<p style="margin:12px 0 0;font-size:13px;color:#b91c1c;"><strong>${report.stuckRuns.length} stuck run${report.stuckRuns.length === 1 ? '' : 's'}:</strong> ${esc(report.stuckRuns.map((r) => `${r.job} started ${when(r.started_at)}`).join('; '))}</p>`

  return `<!doctype html><html><body style="margin:0;padding:0;background:#f3f4f6;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center" style="padding:28px 16px;">
        <table role="presentation" width="620" cellpadding="0" cellspacing="0" style="max-width:620px;width:100%;background:#fff;border:1px solid #dbe4f0;border-radius:12px;">
          <tr><td style="padding:22px 24px;border-bottom:1px solid #e5e7eb;">
            <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;font-weight:700;color:#2563eb;">PlanningPing reliability</div>
            <h1 style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:20px;line-height:1.3;margin:10px 0 0;color:#202124;">Ingest health is ${esc(opts.status)}</h1>
            <p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;line-height:1.6;margin:8px 0 0;color:#6b6c70;">PlanningPing has detected a production data-health issue before customers need to report it.</p>
          </td></tr>
          <tr><td style="padding:20px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:10px;border:1px solid #e5e7eb;border-radius:8px;"><div style="font-size:11px;text-transform:uppercase;color:#6b6c70;">Last fetch</div><div style="font-size:20px;font-weight:700;color:#202124;">${opts.hoursSinceLastFetch}h</div></td>
                <td style="width:10px;"></td>
                <td style="padding:10px;border:1px solid #e5e7eb;border-radius:8px;"><div style="font-size:11px;text-transform:uppercase;color:#6b6c70;">Stale areas</div><div style="font-size:20px;font-weight:700;color:#202124;">${opts.staleAreas}/${opts.totalAreas}</div></td>
                <td style="width:10px;"></td>
                <td style="padding:10px;border:1px solid #e5e7eb;border-radius:8px;"><div style="font-size:11px;text-transform:uppercase;color:#6b6c70;">Failed sources</div><div style="font-size:20px;font-weight:700;color:#202124;">${report.counts.failed}</div></td>
              </tr>
            </table>
            <p style="margin:14px 0 0;font-size:13px;line-height:1.6;color:#6b6c70;">Threshold: ${STALE_AFTER_HOURS}h. Last ingest: ${esc(report.lastIngest ? `${report.lastIngest.status} at ${when(report.lastIngest.started_at)}` : 'none')}.</p>
            ${report.ingestOverdue ? '<p style="margin:12px 0 0;font-size:13px;color:#b91c1c;"><strong>The daily ingest is overdue.</strong></p>' : ''}
            ${stuckHtml}
            <h2 style="font-size:15px;margin:20px 0 0;color:#202124;">Top source issues</h2>
            ${sourcesHtml}
            <p style="margin:22px 0 0;"><a href="${SITE_URL}/admin/data-health" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-size:13px;font-weight:700;padding:10px 14px;border-radius:6px;">Open data-health dashboard</a></p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body></html>`
}

async function sendHealthEmail(opts: {
  to: string[]
  status: 'stale' | 'degraded'
  hoursSinceLastFetch: number | null
  staleAreas: number
  totalAreas: number
  report: HealthReport
  sources: SourceHealthRow[]
}): Promise<boolean> {
  const resend = getResend()
  if (!resend) return false
  const subject = opts.status === 'stale'
    ? `PlanningPing alert: ingest data is stale (${opts.staleAreas} stale areas)`
    : `PlanningPing alert: ingest health is degraded (${opts.report.counts.failed} failed sources)`
  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: opts.to,
      subject,
      html: renderHtml(opts),
    })
    if (error) {
      console.error('sendHealthEmail failed:', error)
      return false
    }
    return true
  } catch (e) {
    console.error('sendHealthEmail threw:', e)
    return false
  }
}

export interface HealthAlertResult {
  status: 'ok' | 'warning' | 'degraded' | 'stale' | 'error'
  notified: boolean
  suppressed: boolean
  recipients: number
  reason: string
  counts: HealthReport['counts'] | null
  staleAreas: number | null
  hoursSinceLastFetch: number | null
}

export async function runHealthAlertCheck(opts: {
  db?: ReturnType<typeof createAdminClient>
  dryRun?: boolean
  force?: boolean
  cooldownHours?: number
} = {}): Promise<HealthAlertResult> {
  const db = opts.db ?? createAdminClient()
  const cooldownHours = opts.cooldownHours ?? DEFAULT_COOLDOWN_HOURS

  try {
    const [freshness, report] = await Promise.all([
      getGlobalIngestFreshness(),
      loadHealthReport(db),
    ])

    if (!report.available) {
      await logPipelineEvent(db, {
        job: 'health_check',
        stage: 'readiness',
        severity: 'error',
        message: 'Reliability tables are unavailable; health alert check could not inspect source health',
      })
      return {
        status: 'error',
        notified: false,
        suppressed: false,
        recipients: 0,
        reason: 'Reliability tables unavailable',
        counts: null,
        staleAreas: freshness.staleAreas,
        hoursSinceLastFetch: freshness.hoursSinceFetch,
      }
    }

    const problemSources = topProblemSources(report)
    const stale = freshness.stale
    const degraded = report.counts.failed > 0 || report.counts.degraded > 0 || report.ingestOverdue || report.stuckRuns.length > 0
    const warning = report.counts.warning > 0
    if (!stale && !degraded) {
      return {
        status: warning ? 'warning' : 'ok',
        notified: false,
        suppressed: false,
        recipients: 0,
        reason: warning ? 'Warnings present, no degraded/stale condition' : 'Healthy',
        counts: report.counts,
        staleAreas: freshness.staleAreas,
        hoursSinceLastFetch: freshness.hoursSinceFetch,
      }
    }

    const status = stale ? 'stale' : 'degraded'
    const to = recipients()
    const fingerprint = healthFingerprint({ stale, report, sources: problemSources })

    if (to.length === 0) {
      await logPipelineEvent(db, {
        job: 'health_check',
        stage: 'notify',
        severity: 'error',
        message: 'Health alert could not send because no recipients are configured',
        detail: { status, fingerprint },
      })
      return {
        status,
        notified: false,
        suppressed: false,
        recipients: 0,
        reason: 'No HEALTH_ALERT_EMAILS, ADMIN_EMAILS, or fallback recipient configured',
        counts: report.counts,
        staleAreas: freshness.staleAreas,
        hoursSinceLastFetch: freshness.hoursSinceFetch,
      }
    }

    const duplicate = !opts.force && await alreadyNotified(db, fingerprint, cooldownHours)
    if (duplicate) {
      return {
        status,
        notified: false,
        suppressed: true,
        recipients: to.length,
        reason: `Same health alert sent in the last ${cooldownHours}h`,
        counts: report.counts,
        staleAreas: freshness.staleAreas,
        hoursSinceLastFetch: freshness.hoursSinceFetch,
      }
    }

    const detail = {
      status,
      fingerprint,
      dry_run: Boolean(opts.dryRun),
      stale_areas: freshness.staleAreas,
      hours_since_last_fetch: freshness.hoursSinceFetch,
      source_counts: report.counts,
      ingest_overdue: report.ingestOverdue,
      stuck_runs: report.stuckRuns.length,
      recipients: to.length,
      source_keys: problemSources.map((s) => s.sourceKey),
    }

    if (opts.dryRun) {
      await logPipelineEvent(db, {
        job: 'health_check',
        stage: 'notify',
        severity: status === 'stale' ? 'critical' : 'error',
        message: 'Health alert dry run would notify admins',
        detail,
      })
      return {
        status,
        notified: false,
        suppressed: false,
        recipients: to.length,
        reason: 'Dry run',
        counts: report.counts,
        staleAreas: freshness.staleAreas,
        hoursSinceLastFetch: freshness.hoursSinceFetch,
      }
    }

    const sent = await sendHealthEmail({
      to,
      status,
      hoursSinceLastFetch: freshness.hoursSinceFetch,
      staleAreas: freshness.staleAreas,
      totalAreas: freshness.totalAreas,
      report,
      sources: problemSources,
    })

    await logPipelineEvent(db, {
      job: 'health_check',
      stage: 'notify',
      severity: sent ? (status === 'stale' ? 'critical' : 'error') : 'critical',
      message: sent ? 'Health alert sent to admins' : 'Health alert email failed to send',
      detail,
    })

    return {
      status,
      notified: sent,
      suppressed: false,
      recipients: to.length,
      reason: sent ? 'Alert sent' : 'Email send failed',
      counts: report.counts,
      staleAreas: freshness.staleAreas,
      hoursSinceLastFetch: freshness.hoursSinceFetch,
    }
  } catch (e) {
    await logPipelineEvent(db, {
      job: 'health_check',
      stage: 'check',
      severity: 'critical',
      message: 'Health alert check failed',
      error: e,
    })
    return {
      status: 'error',
      notified: false,
      suppressed: false,
      recipients: 0,
      reason: e instanceof Error ? e.message : 'Health alert check failed',
      counts: null,
      staleAreas: null,
      hoursSinceLastFetch: null,
    }
  }
}
