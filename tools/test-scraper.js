#!/usr/bin/env node
/**
 * Test scraper for the Staffordshire Moorlands Idox portal.
 *
 * This portal is an older servlet-based Idox implementation — it uses
 * positional <td> columns (not CSS class selectors like the newer portals).
 *
 * Column order in the results table:
 *   0  Application number  (contains <a href="...?PKID=...">)
 *   1  Received date       DD/MM/YYYY
 *   2  Valid date          DD/MM/YYYY or empty
 *   3  Site location       multi-line text with comma separators
 *   4  Proposal            description
 *   5  Decision            status
 *   6  Decision date       DD/MM/YYYY or empty
 *
 * Pagination: the portal returns 20 rows per page. The "Next" form POSTs back
 * with LAST_ROW_ID + DIRECTION=F using a server-side session cookie.
 */

const PORTAL_URL =
  'http://publicaccess.staffsmoorlands.gov.uk/portal/servlets/ApplicationSearchServlet';

const POSTCODE = 'ST10';
const DAYS_BACK = 7;
const MAX_PAGES = 20;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(date) {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${date.getFullYear()}`;
}

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n));
}

function stripTags(html) {
  return decodeEntities(html.replace(/<[^>]+>/g, ''));
}

function parseAddress(cellHtml) {
  // Address parts are separated by literal newlines and commas in the raw text.
  // Strip any HTML tags, split on newlines and commas, trim each part.
  return stripTags(cellHtml)
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .join(', ');
}

function parseDate(cellHtml) {
  const text = stripTags(cellHtml).trim();
  const m = text.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null; // → YYYY-MM-DD
}

// ─── HTML Parsing ─────────────────────────────────────────────────────────────

function parsePage(html) {
  if (/your query did not return any results/i.test(html)) {
    return { applications: [], hasNext: false, lastRowId: null };
  }

  // Locate the results table by finding the header row.
  const tableStart = html.indexOf('<th><strong>Application number');
  if (tableStart === -1) {
    return { applications: [], hasNext: false, lastRowId: null };
  }

  // Walk back to the opening <table> tag.
  const tableOpenPos = html.lastIndexOf('<table', tableStart);
  if (tableOpenPos === -1) {
    return { applications: [], hasNext: false, lastRowId: null };
  }

  // Walk forward to the closing </table> tag.
  const tableEndPos = html.indexOf('</table>', tableStart);
  if (tableEndPos === -1) {
    return { applications: [], hasNext: false, lastRowId: null };
  }

  const tableHtml = html.slice(tableOpenPos, tableEndPos + 8);

  // Split into rows — split on <tr (case-insensitive) and process each chunk.
  const rowChunks = tableHtml.split(/<tr[^>]*>/i).slice(1); // slice(1) drops the pre-first-<tr> content

  const applications = [];

  for (const chunk of rowChunks) {
    // Skip header rows (contain <th>).
    if (/<th/i.test(chunk)) continue;

    // Each data row must have a PKID link — quick guard.
    if (!chunk.includes('PKID=')) continue;

    // Extract cells by splitting on <td (positional, not class-based).
    const cellChunks = chunk.split(/<td[^>]*>/i).slice(1);
    if (cellChunks.length < 6) continue;

    // Strip the trailing </td>...</row-content> from each cell.
    const cells = cellChunks.map((c) => c.replace(/<\/td>[\s\S]*/i, ''));

    // Cell 0: reference number inside <a href="...?PKID=...">
    const refMatch = /<a[^>]+href="([^"]*PKID=[^"]*)"[^>]*>([^<]+)<\/a>/i.exec(cells[0]);
    if (!refMatch) continue;

    applications.push({
      reference: refMatch[2].trim(),
      address: parseAddress(cells[3]),
      description: stripTags(cells[4]).trim(),
      status: stripTags(cells[5]).trim(),
      date_received: parseDate(cells[1]),
      valid_date: parseDate(cells[2]),
      decision_date: cells[6] ? parseDate(cells[6]) : null,
      detail_url: refMatch[1].trim(),
    });
  }

  // Detect pagination: the "Next" form contains a hidden LAST_ROW_ID input.
  const lastRowMatch = /name="LAST_ROW_ID"\s+value="(\d+)"/i.exec(html);
  const hasNext =
    /value="Next Matching Results"/i.test(html) && !!lastRowMatch;

  return {
    applications,
    hasNext,
    lastRowId: lastRowMatch ? lastRowMatch[1] : null,
  };
}

// ─── Fetching ────────────────────────────────────────────────────────────────

async function postForm(body, cookieHeader) {
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (cookieHeader) headers['Cookie'] = cookieHeader;

  const bodyStr = new URLSearchParams(body).toString();
  console.log(`[fetch] POST ${PORTAL_URL}`);
  console.log(`[fetch] body: ${bodyStr}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  let res;
  try {
    res = await fetch(PORTAL_URL, {
      method: 'POST',
      headers,
      body: bodyStr,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  console.log(`[fetch] HTTP status: ${res.status} ${res.statusText}`);

  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

  const raw = res.headers.get('set-cookie') || '';
  const cookie = raw ? raw.split(';')[0] : cookieHeader || '';

  const html = await res.text();
  console.log(`[fetch] HTML length: ${html.length} chars`);

  return { html, cookie };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - DAYS_BACK * 24 * 60 * 60 * 1000);
  const dateFrom = formatDate(weekAgo);
  const dateTo = formatDate(now);

  console.log(`[scraper] postcode: ${POSTCODE}`);
  console.log(`[scraper] date range: ${dateFrom} to ${dateTo}`);

  const { html: firstHtml, cookie } = await postForm({
    FullAddress: POSTCODE,
    ReceivedDateFrom: dateFrom,
    ReceivedDateTo: dateTo,
  });

  const firstPage = parsePage(firstHtml);
  console.log(`[parse] page 1: ${firstPage.applications.length} result(s), hasNext: ${firstPage.hasNext}`);

  const allApplications = [...firstPage.applications];
  let hasNext = firstPage.hasNext;
  let lastRowId = firstPage.lastRowId;
  let pageNum = 2;

  while (hasNext && pageNum <= MAX_PAGES) {
    const { html: nextHtml, cookie: nextCookie } = await postForm(
      { LAST_ROW_ID: lastRowId, DIRECTION: 'F', RECORDS: '20', forward: 'Next Matching Results' },
      cookie || nextCookie
    );

    const page = parsePage(nextHtml);
    console.log(`[parse] page ${pageNum}: ${page.applications.length} result(s), hasNext: ${page.hasNext}`);
    allApplications.push(...page.applications);

    hasNext = page.hasNext;
    lastRowId = page.lastRowId;
    pageNum++;
  }

  console.log(`[scraper] total applications found: ${allApplications.length}`);

  const output = {
    council: 'Staffordshire Moorlands District Council',
    portal: PORTAL_URL,
    postcode: POSTCODE,
    date_range: { from: dateFrom, to: dateTo },
    count: allApplications.length,
    applications: allApplications,
  };

  console.log('\n--- RESULTS ---');
  console.log(JSON.stringify(output, null, 2));
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
