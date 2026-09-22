// Duplicate detection for planning applications.
//
// The strong identity is authority + reference, already enforced by the unique
// (council_slug, reference) constraint. It must never be weakened to reference
// alone: measured in production, Leeds and Westminster both hold a
// 26/04287/ADV, and Newham and Rushcliffe both hold a 26/01447/FUL — different
// applications on different sites that share a numbering scheme.
//
// Everything beyond that key is a *candidate*, not a merge. Two applications on
// the same site on the same day with the same wording are very often genuinely
// separate (a full application and its listed building consent), so the fuzzy
// rules below only ever raise a flag for review. The one case handled
// automatically is a reference that differs from a stored one only in spacing
// or letter case within the same authority — the same record by definition.
//
// Free of runtime imports so it can be tested with node --test.

export type DuplicateMatchType =
  | 'reference_variant'
  | 'same_source_record'
  | 'cross_authority_same_source_url'
  | 'same_site_same_day_same_description'

export type DuplicateConfidence = 'high' | 'medium' | 'low'

export interface DuplicateSubject {
  id: string
  council_slug: string
  reference: string
  address: string | null
  description: string | null
  application_date: string | null
  source_url: string | null
}

export interface DuplicateMatch {
  applicationId: string
  candidateId: string
  matchType: DuplicateMatchType
  confidence: DuplicateConfidence
  evidence: Record<string, string | number | null>
}

/** Whitespace-free, upper-case — for comparing references, never for storing them. */
export function normaliseReference(reference: string): string {
  return reference.replace(/\s+/g, '').toUpperCase()
}

export function normaliseAddress(address: string | null): string {
  if (!address) return ''
  return address.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}

const POSTCODE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i

export function extractPostcode(text: string | null): string | null {
  if (!text) return null
  const m = POSTCODE.exec(text)
  return m ? `${m[1].toUpperCase()} ${m[2].toUpperCase()}` : null
}

function tokens(text: string | null): Set<string> {
  return new Set(
    (text ?? '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2),
  )
}

/** Jaccard similarity of word tokens, 0..1. Two empty texts are not similar. */
export function textSimilarity(a: string | null, b: string | null): number {
  const ta = tokens(a)
  const tb = tokens(b)
  if (ta.size === 0 || tb.size === 0) return 0
  let shared = 0
  for (const t of ta) if (tb.has(t)) shared++
  return shared / (ta.size + tb.size - shared)
}

/** Trailing letter code of a reference, e.g. "26/04314/LBC" -> "LBC". */
export function referenceSuffix(reference: string): string {
  const m = /([A-Za-z]+)\s*$/.exec(reference.trim())
  return m ? m[1].toUpperCase() : ''
}

export function normaliseUrl(url: string | null): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    const params = [...u.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b))
    const query = params.map(([k, v]) => `${k.toLowerCase()}=${v}`).join('&')
    return `${u.host.toLowerCase()}${u.pathname.replace(/\/+$/, '')}${query ? `?${query}` : ''}`
  } catch {
    return url.trim().toLowerCase() || null
  }
}

/** Order a pair the way the database's check constraint expects (uuid order). */
export function orderedPair(a: string, b: string): [string, string] {
  return a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a]
}

const SIMILAR_DESCRIPTION = 0.95

type MatchBody = Omit<DuplicateMatch, 'applicationId' | 'candidateId'>

export function compareApplications(a: DuplicateSubject, b: DuplicateSubject): MatchBody | null {
  const sameCouncil = a.council_slug === b.council_slug

  if (sameCouncil && a.reference !== b.reference && normaliseReference(a.reference) === normaliseReference(b.reference)) {
    return {
      matchType: 'reference_variant',
      confidence: 'high',
      evidence: { reference_a: a.reference, reference_b: b.reference },
    }
  }

  const urlA = normaliseUrl(a.source_url)
  const urlB = normaliseUrl(b.source_url)
  if (urlA && urlA === urlB && !(sameCouncil && a.reference === b.reference)) {
    return sameCouncil
      ? {
          matchType: 'same_source_record',
          confidence: 'medium',
          evidence: { source_url: a.source_url, reference_a: a.reference, reference_b: b.reference },
        }
      : {
          matchType: 'cross_authority_same_source_url',
          confidence: 'high',
          evidence: { source_url: a.source_url, council_a: a.council_slug, council_b: b.council_slug },
        }
  }

  if (
    sameCouncil &&
    a.reference !== b.reference &&
    a.application_date &&
    a.application_date === b.application_date &&
    normaliseAddress(a.address) !== '' &&
    normaliseAddress(a.address) === normaliseAddress(b.address) &&
    // A full application and its listed-building or advert consent share a
    // site, a day and often the wording — and are separate applications.
    referenceSuffix(a.reference) === referenceSuffix(b.reference)
  ) {
    const similarity = textSimilarity(a.description, b.description)
    if (similarity >= SIMILAR_DESCRIPTION) {
      return {
        matchType: 'same_site_same_day_same_description',
        confidence: 'low',
        evidence: {
          address: a.address,
          application_date: a.application_date,
          description_similarity: Math.round(similarity * 100) / 100,
        },
      }
    }
  }

  return null
}

/**
 * Candidate pairs between incoming applications and each other or existing
 * ones. Never returns a pair twice, never pairs a record with itself.
 */
export function findDuplicateCandidates(
  incoming: DuplicateSubject[],
  existing: DuplicateSubject[],
): DuplicateMatch[] {
  const pool = new Map<string, DuplicateSubject>()
  for (const s of [...existing, ...incoming]) pool.set(s.id, s)
  const all = [...pool.values()]
  const seen = new Set<string>()
  const matches: DuplicateMatch[] = []

  for (const a of incoming) {
    for (const b of all) {
      if (a.id === b.id) continue
      const [first, second] = orderedPair(a.id, b.id)
      const key = `${first}|${second}`
      if (seen.has(key)) continue
      const result = compareApplications(a, b)
      if (!result) continue
      seen.add(key)
      matches.push({ applicationId: first, candidateId: second, ...result })
    }
  }
  return matches
}

/**
 * The stored reference an incoming one should be written to, when the only
 * difference is spacing or case. Returns the incoming reference unchanged when
 * there is no such variant.
 */
export function canonicalReference(incoming: string, storedReferences: Iterable<string>): string {
  const target = normaliseReference(incoming)
  // Materialised once: callers pass Map.keys(), an iterator that can only be
  // walked a single time.
  const stored = [...storedReferences]
  if (stored.includes(incoming)) return incoming
  for (const candidate of stored) {
    if (normaliseReference(candidate) === target) return candidate
  }
  return incoming
}
