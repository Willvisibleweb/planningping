// Error text that is safe to store and show internally.
//
// Pipeline errors are written to a table and rendered on the admin page, so
// anything that could carry a credential is stripped first, and stack traces
// are never kept — the message and the stage are what an operator needs, and
// the Vercel log still has the full trace for the rare deep dive.

const SECRET_PATTERNS: RegExp[] = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /\bsk-[A-Za-z0-9_-]{8,}/g, // Anthropic / Stripe style keys
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g, // JWTs (Supabase keys)
  /\b(?:api[_-]?key|apikey|token|secret|password|passwd|authorization|x-webhook-secret)\s*[=:]\s*[^\s&"',;]+/gi,
]
const QUERY_SECRET = /([?&](?:key|api_key|apikey|token|secret|sig|signature)=)[^&\s"']+/gi

const MAX_LENGTH = 500

export function sanitiseMessage(text: string): string {
  let out = text.replace(QUERY_SECRET, '$1[redacted]')
  for (const pattern of SECRET_PATTERNS) out = out.replace(pattern, '[redacted]')
  out = out.replace(/\s+/g, ' ').trim()
  return out.length > MAX_LENGTH ? `${out.slice(0, MAX_LENGTH - 1)}…` : out
}

/** The message of an unknown thrown value, sanitised, never its stack. */
export function sanitiseError(error: unknown): string {
  if (error instanceof Error) {
    const name = error.name && error.name !== 'Error' ? `${error.name}: ` : ''
    return sanitiseMessage(`${name}${error.message}`)
  }
  if (typeof error === 'string') return sanitiseMessage(error)
  try {
    return sanitiseMessage(JSON.stringify(error) ?? 'Unknown error')
  } catch {
    return 'Unknown error'
  }
}
