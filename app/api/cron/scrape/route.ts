import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Allow up to 5 minutes — scraping multiple councils sequentially takes time.
export const maxDuration = 300

// ── Types ─────────────────────────────────────────────────────────────────────

interface ScrapedApplication {
  reference: string
  address: string | null
  description: string | null
  status: string | null
  application_date: string | null
  decision_date: string | null
}

interface PageResult {
  applications: ScrapedApplication[]
  hasNext: boolean
  lastRowId: string | null
}

// ── HTML helpers ──────────────────────────────────────────────────────────────

function decodeEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)))
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ''))
}

function parseAddress(cellHtml: string): string | null {
  const parts = stripTags(cellHtml)
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : null
}

function parseCellDate(cellHtml: string): string | null {
  const m = stripTags(cellHtml).trim().match(/(\d{2})\/(\d{2})\/(\d{4})/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

function formatDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${d.getFullYear()}`
}

// ── Parsers ───────────────────────────────────────────────────────────────────

// Servlet portals (e.g. Staffordshire Moorlands, Haringey):
// Results in a plain <table> — columns are positional, no CSS class selectors.
// Column order: application_number | received_date | valid_date |
//               address | proposal | status | decision_date
function parseServletPage(html: string): PageResult {
  if (/your query did not return any results/i.test(html)) {
    return { applications: [], hasNext: false, lastRowId: null }
  }

  const tableStart = html.indexOf('<th><strong>Application number')
  if (tableStart === -1) return { applications: [], hasNext: false, lastRowId: null }

  const tableOpenPos = html.lastIndexOf('<table', tableStart)
  const tableEndPos = html.indexOf('</table>', tableStart)
  if (tableOpenPos === -1 || tableEndPos === -1) {
    return { applications: [], hasNext: false, lastRowId: null }
  }

  const tableHtml = html.slice(tableOpenPos, tableEndPos + 8)
  const rowChunks = tableHtml.split(/<tr[^>]*>/i).slice(1)
  const applications: ScrapedApplication[] = []

  for (const chunk of rowChunks) {
    if (/<th/i.test(chunk) || !chunk.includes('PKID=')) continue

    const cellChunks = chunk.split(/<td[^>]*>/i).slice(1)
    if (cellChunks.length < 6) continue

    const cells = cellChunks.map((c) => c.replace(/<\/td>[\s\S]*/i, ''))
    const refMatch = /<a[^>]+href="[^"]*PKID=[^"]*"[^>]*>([^<]+)<\/a>/i.exec(cells[0])
    if (!refMatch) continue

    applications.push({
      reference: refMatch[1].trim(),
      address: parseAddress(cells[3]),
      description: stripTags(cells[4]).trim() || null,
      status: stripTags(cells[5]).trim() || null,
      application_date: parseCellDate(cells[1]),
      decision_date: cells[6] ? parseCellDate(cells[6]) : null,
    })
  }

  const lastRowMatch = /name="LAST_ROW_ID"\s+value="(\d+)"/i.exec(html)
  const hasNext = /value="Next Matching Results"/i.test(html) && !!lastRowMatch

  return { applications, hasNext, lastRowId: lastRowMatch?.[1] ?? null }
}

// Modern search.do portals (Westminster, Camden, etc.):
// Results in a <table> with rows having class="odd" or class="even".
// Columns identified by CSS class names on <td> elements.
function parseSearchDoPage(html: string): ScrapedApplication[] {
  const applications: ScrapedApplication[] = []
  const rowRegex = /<tr[^>]+class=["'](?:odd|even)["'][^>]*>([\s\S]*?)<\/tr>/gi
  let rowMatch: RegExpExecArray | null

  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const row = rowMatch[1]

    const refMatch = /<td[^>]*class="[^"]*number[^"]*"[^>]*>[\s\S]*?<a[^>]*>\s*([^<]+)\s*<\/a>/i.exec(row)
    if (!refMatch) continue

    const addrMatch = /<td[^>]*class="[^"]*address[^"]*"[^>]*>([\s\S]*?)<\/td>/i.exec(row)
    const descMatch = /<td[^>]*class="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/td>/i.exec(row)
    const statusMatch = /<td[^>]*class="[^"]*status[^"]*"[^>]*>([\s\S]*?)<\/td>/i.exec(row)
    const dateMatch = /<td[^>]*class="[^"]*date[^"]*"[^>]*>([\s\S]*?)<\/td>/i.exec(row)

    applications.push({
      reference: refMatch[1].trim(),
      address: addrMatch ? stripTags(addrMatch[1]).trim() || null : null,
      description: descMatch ? stripTags(descMatch[1]).trim() || null : null,
      status: statusMatch ? stripTags(statusMatch[1]).trim() || null : null,
      application_date: dateMatch ? parseCellDate(dateMatch[1]) : null,
      decision_date: null,
    })
  }

  return applications
}

// ── Scrapers ──────────────────────────────────────────────────────────────────

async function fetchWithTimeout(url: string, init: RequestInit, ms = 15_000): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

// POST form data to the servlet URL with no address filter — returns all
// applications for the council in the given date range, with pagination.
async function scrapeServlet(
  portalUrl: string,
  dateFrom: string,
  dateTo: string,
): Promise<ScrapedApplication[]> {
  const all: ScrapedApplication[] = []
  const MAX_PAGES = 20
  let cookie = ''

  const initialBody = new URLSearchParams({ ReceivedDateFrom: dateFrom, ReceivedDateTo: dateTo })
  const res = await fetchWithTimeout(portalUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: initialBody.toString(),
  })
  if (!res.ok) throw new Error(`Portal returned HTTP ${res.status}`)

  const setCookie = res.headers.get('set-cookie') ?? ''
  if (setCookie) cookie = setCookie.split(';')[0]

  let page = parseServletPage(await res.text())
  all.push(...page.applications)

  let pageNum = 2
  while (page.hasNext && page.lastRowId && pageNum <= MAX_PAGES) {
    const nextBody = new URLSearchParams({
      LAST_ROW_ID: page.lastRowId,
      DIRECTION: 'F',
      RECORDS: '20',
      forward: 'Next Matching Results',
    })
    const nextRes = await fetchWithTimeout(portalUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: nextBody.toString(),
    })
    if (!nextRes.ok) break

    const nextSetCookie = nextRes.headers.get('set-cookie') ?? ''
    if (nextSetCookie) cookie = nextSetCookie.split(';')[0]

    page = parseServletPage(await nextRes.text())
    all.push(...page.applications)
    pageNum++
  }

  return all
}

// GET request to /search.do with date range query params.
// Only fetches the first page — these portals typically return fewer results.
async function scrapeSearchDo(
  portalUrl: string,
  dateFrom: string,
  dateTo: string,
): Promise<ScrapedApplication[]> {
  const params = new URLSearchParams({
    action: 'advanced',
    searchType: 'Application',
    dateType: 'DC_Received',
    dateFrom,
    dateTo,
  })
  const res = await fetchWithTimeout(`${portalUrl}/search.do?${params}`, { method: 'GET' })
  if (!res.ok) throw new Error(`Portal returned HTTP ${res.status}`)
  return parseSearchDoPage(await res.text())
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  // Vercel automatically sends CRON_SECRET as a Bearer token on cron invocations.
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // 1. Get all unique council slugs from active tracked areas.
  const { data: areas, error: areasErr } = await supabase
    .from('tracked_areas')
    .select('council_slug')
  if (areasErr) return NextResponse.json({ error: areasErr.message }, { status: 500 })

  const slugs = [...new Set((areas ?? []).map((a) => a.council_slug as string))]
  if (slugs.length === 0) {
    return NextResponse.json({ message: 'No tracked areas', results: [] })
  }

  // 2. Fetch portal details for all councils being tracked.
  const { data: councils, error: councilsErr } = await supabase
    .from('councils')
    .select('slug, portal_url, portal_type')
    .in('slug', slugs)
  if (councilsErr) return NextResponse.json({ error: councilsErr.message }, { status: 500 })

  // 3. Build the date range (last 7 days).
  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const dateFrom = formatDate(weekAgo)
  const dateTo = formatDate(now)

  const baseUrl = new URL(request.url).origin
  const webhookUrl = `${baseUrl}/api/webhooks/n8n`

  const results: Array<{ council: string; scraped?: number; stored?: number; error?: string }> = []

  // 4. Scrape each council and forward results to the webhook.
  for (const council of councils ?? []) {
    try {
      const applications =
        council.portal_type === 'idox_servlet'
          ? await scrapeServlet(council.portal_url as string, dateFrom, dateTo)
          : await scrapeSearchDo(council.portal_url as string, dateFrom, dateTo)

      if (applications.length === 0) {
        results.push({ council: council.slug as string, scraped: 0, stored: 0 })
        continue
      }

      const webhookRes = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-secret': process.env.WEBHOOK_SECRET ?? '',
        },
        body: JSON.stringify({ council_slug: council.slug, applications }),
      })

      if (!webhookRes.ok) {
        throw new Error(`Webhook returned ${webhookRes.status}: ${await webhookRes.text()}`)
      }

      const webhookBody = await webhookRes.json() as { received?: number; updated?: number }
      results.push({
        council: council.slug as string,
        scraped: applications.length,
        stored: webhookBody.updated ?? 0,
      })
    } catch (err) {
      results.push({ council: council.slug as string, error: String(err) })
    }
  }

  return NextResponse.json({
    ran_at: now.toISOString(),
    date_from: dateFrom,
    date_to: dateTo,
    results,
  })
}
