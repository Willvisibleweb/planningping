#!/usr/bin/env node
// Benchmark PlanningPing against an external record of the same applications.
//
//   node tools/benchmark.mjs import "<set name>" records.csv [--source "External source name"]
//   node tools/benchmark.mjs report "<set name>"
//   node tools/benchmark.mjs list
//
// CSV columns (header row required — copy tools/benchmark-template.csv):
//   authority, reference, address, applicant, description, status,
//   source_url, published_date (YYYY-MM-DD or DD/MM/YYYY), external_id
//
// What import does, per external record:
//   - finds the authority in our councils (by name or slug) and the
//     application by authority + reference (spacing/case ignored);
//   - scores reference, address, applicant, description, status and link
//     automatically. Anything it cannot decide cleanly is 'needs_review', not a
//     guess; review_method is 'auto' until a person edits the row;
//   - counts duplicates (other stored spellings of the same reference, plus
//     open duplicate candidates);
//   - checks any cached AI summary for figures not present in the source;
//   - measures detection delay: our first sighting minus the external
//     publication date.
// Rows a person has reviewed (review_method = 'human') are never overwritten.
// Classification reasonableness is left for a person to judge.
//
// Every metric in `report` is computed from stored rows only
// (lib/reliability/benchmark.ts). Nothing is estimated or defaulted.
//
// Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from the
// environment or .env.local. Needs Node 23.6+ (imports the TypeScript modules
// directly).

import { existsSync, readFileSync } from 'node:fs'
import { BENCHMARK_FIELDS, compareField, computeBenchmarkMetrics, detectionDelayDays } from '../lib/reliability/benchmark.ts'
import { extractFigures, findUnsupportedFigures } from '../lib/reliability/aiGuard.ts'
import { normaliseReference } from '../lib/reliability/duplicates.ts'

if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
  }
}
const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!BASE || !KEY) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or run from the project root with .env.local).')
  process.exit(1)
}
const HEADERS = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }

async function rest(path, init = {}) {
  const res = await fetch(`${BASE}/rest/v1/${path}`, { ...init, headers: { ...HEADERS, ...(init.headers ?? {}) } })
  const text = await res.text()
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path.split('?')[0]}: HTTP ${res.status} ${text.slice(0, 300)}`)
  return text ? JSON.parse(text) : null
}

async function all(path) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const page = await rest(path, { headers: { Range: `${from}-${from + 999}` } })
    out.push(...page)
    if (page.length < 1000) return out
  }
}

const chunks = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size))

function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some((v) => v.trim() !== '')) rows.push(row)
      row = []
    } else field += c
  }
  row.push(field)
  if (row.some((v) => v.trim() !== '')) rows.push(row)
  const [header, ...body] = rows
  const keys = header.map((h) => h.trim().toLowerCase())
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim() || null])))
}

function isoDate(value) {
  if (!value) return null
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10)
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value)
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null
}

async function findSet(name) {
  const [set] = await rest(`benchmark_sets?select=id,name,external_source&name=eq.${encodeURIComponent(name)}`)
  return set ?? null
}

async function importSet(name, file, externalSource) {
  const records = parseCsv(readFileSync(file, 'utf8'))
  const missing = records.filter((r) => !r.authority || !r.reference)
  if (missing.length > 0) throw new Error(`${missing.length} row(s) lack authority or reference`)

  let set = await findSet(name)
  if (!set) {
    ;[set] = await rest('benchmark_sets', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ name, external_source: externalSource ?? null }),
    })
  }

  const councils = await all('councils?select=slug,name,canonical_slug')
  const slugFor = new Map()
  for (const c of councils) {
    const canonical = c.canonical_slug ?? c.slug
    slugFor.set(c.slug.toLowerCase(), canonical)
    if (!c.canonical_slug) slugFor.set(c.name.trim().toLowerCase(), canonical)
  }

  const slugs = [...new Set(records.map((r) => slugFor.get(r.authority.trim().toLowerCase())).filter(Boolean))]
  const idsByRef = new Map() // slug|normalised ref -> [id]
  for (const slug of slugs) {
    for (const row of await all(`planning_applications?select=id,reference&council_slug=eq.${encodeURIComponent(slug)}`)) {
      const key = `${slug}|${normaliseReference(row.reference)}`
      idsByRef.set(key, [...(idsByRef.get(key) ?? []), row.id])
    }
  }

  const matchedIds = [...new Set(records.map((r) => {
    const slug = slugFor.get(r.authority.trim().toLowerCase())
    return slug ? idsByRef.get(`${slug}|${normaliseReference(r.reference)}`)?.[0] : undefined
  }).filter(Boolean))]

  const details = new Map()
  const openDuplicates = new Map()
  for (const part of chunks(matchedIds, 100)) {
    const list = part.join(',')
    for (const row of await rest(`planning_applications?select=id,reference,address,description,status,source_url,raw_data,created_at,ai_summary&id=in.(${list})`)) details.set(row.id, row)
    for (const d of await rest(`duplicate_candidates?select=application_id,candidate_id&status=eq.open&or=(application_id.in.(${list}),candidate_id.in.(${list}))`)) {
      for (const id of [d.application_id, d.candidate_id]) openDuplicates.set(id, (openDuplicates.get(id) ?? 0) + 1)
    }
  }

  const human = new Set(
    (await all(`benchmark_items?select=authority_name,reference,review_method&set_id=eq.${set.id}`))
      .filter((i) => i.review_method === 'human')
      .map((i) => `${i.authority_name}|${i.reference}`),
  )

  const now = new Date().toISOString()
  const items = []
  let skipped = 0
  for (const r of records) {
    if (human.has(`${r.authority}|${r.reference}`)) { skipped++; continue }
    const slug = slugFor.get(r.authority.trim().toLowerCase()) ?? null
    const ids = slug ? idsByRef.get(`${slug}|${normaliseReference(r.reference)}`) ?? [] : []
    const ours = ids.length > 0 ? details.get(ids[0]) : null
    const ourUrl = ours ? ours.source_url ?? ours.raw_data?.url ?? null : null
    const summary = ours?.ai_summary ?? null
    items.push({
      set_id: set.id,
      external_id: r.external_id,
      authority_name: r.authority,
      council_slug: slug,
      reference: r.reference,
      address: r.address,
      applicant: r.applicant,
      description: r.description,
      status: r.status,
      source_url: r.source_url,
      external_published_date: isoDate(r.published_date),
      matched_application_id: ours?.id ?? null,
      found: Boolean(ours),
      reference_verdict: ours ? compareField('reference', r.reference, ours.reference) : null,
      address_verdict: ours ? compareField('address', r.address, ours.address) : null,
      // PlanIt redacts applicant names, so this is expected to be 'missing'.
      applicant_verdict: ours ? compareField('applicant', r.applicant, null) : null,
      description_verdict: ours ? compareField('description', r.description, ours.description) : null,
      status_verdict: ours ? compareField('status', r.status, ours.status) : null,
      source_url_verdict: ours ? compareField('source_url', r.source_url, ourUrl) : null,
      duplicate_count: ours ? ids.length - 1 + (openDuplicates.get(ours.id) ?? 0) : null,
      ai_claims_checked: summary ? extractFigures(summary).length : null,
      ai_unsupported_claims: summary ? findUnsupportedFigures(summary, [ours.description, ours.address, ours.reference, ours.status]).length : null,
      classification_verdict: null,
      detected_at: ours?.created_at ?? null,
      detection_delay_days: ours ? detectionDelayDays(isoDate(r.published_date), ours.created_at) : null,
      review_method: 'auto',
      notes: !slug ? 'Authority not in PlanningPing councils' : ours ? null : 'Not found for this authority and reference',
      reviewed_at: now,
    })
  }

  for (const part of chunks(items, 200)) {
    await rest('benchmark_items?on_conflict=set_id,authority_name,reference', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(part),
    })
  }
  console.log(`Imported ${items.length} record(s) into "${name}"${skipped ? `; left ${skipped} human-reviewed row(s) untouched` : ''}.`)
  await report(name)
}

const pct = (rate) => (rate.value === null ? 'not measured' : `${(rate.value * 100).toFixed(1)}%`)

async function report(name) {
  const set = await findSet(name)
  if (!set) throw new Error(`No benchmark set named "${name}"`)
  const items = await all(`benchmark_items?select=*&set_id=eq.${set.id}`)
  const m = computeBenchmarkMetrics(items)
  console.log(`\nBenchmark: ${set.name}${set.external_source ? ` (vs ${set.external_source})` : ''} — ${m.items} record(s)`)
  console.log(`  Coverage                ${pct(m.coverage)}  (${m.coverage.numerator}/${m.coverage.denominator} found)`)
  for (const f of BENCHMARK_FIELDS) {
    const a = m.fieldAccuracy[f]
    console.log(`  ${`${f} accuracy`.padEnd(24)}${pct(a)}  (${a.numerator}/${a.denominator}; ${a.missing} missing, ${a.pendingReview} to review, ${a.notApplicable} n/a)`)
  }
  console.log(`  Duplicate rate          ${pct(m.duplicateRate)}  (${m.duplicateRate.numerator}/${m.duplicateRate.denominator})`)
  console.log(`  Unsupported AI figures  ${pct(m.unsupportedClaimRate)}  (${m.unsupportedClaimRate.numerator}/${m.unsupportedClaimRate.denominator} figure claims in cached summaries)`)
  console.log(`  Classification          ${pct(m.classificationReasonable)}  (${m.classificationReasonable.denominator} judged by a person)`)
  console.log(`  Detection delay         ${m.averageDetectionDelayDays === null ? 'not measured' : `${m.averageDetectionDelayDays.toFixed(1)} days mean, ${m.medianDetectionDelayDays.toFixed(1)} median (${m.delaySamples} samples; negative = we saw it first)`}`)
  const pending = BENCHMARK_FIELDS.reduce((n, f) => n + m.fieldAccuracy[f].pendingReview, 0)
  if (pending > 0) console.log(`\n  ${pending} field verdict(s) need a person to decide before the accuracy figures are final.`)
}

async function list() {
  const sets = await rest('benchmark_sets?select=name,external_source,created_at&order=created_at.desc')
  if (sets.length === 0) console.log('No benchmark sets yet.')
  for (const s of sets) console.log(`${s.created_at.slice(0, 10)}  ${s.name}${s.external_source ? ` (vs ${s.external_source})` : ''}`)
}

const [command, name, file, ...rest_] = process.argv.slice(2)
const sourceFlag = rest_.indexOf('--source')
try {
  if (command === 'import' && name && file) await importSet(name, file, sourceFlag >= 0 ? rest_[sourceFlag + 1] : null)
  else if (command === 'report' && name) await report(name)
  else if (command === 'list') await list()
  else {
    console.log('Usage:\n  node tools/benchmark.mjs import "<set name>" records.csv [--source "External source"]\n  node tools/benchmark.mjs report "<set name>"\n  node tools/benchmark.mjs list')
    process.exit(command ? 1 : 0)
  }
} catch (e) {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
}
