// Server and edge error reporting.
//
// Inert until SENTRY_DSN is set: with no DSN we never call init, so there is no
// client, no network calls and no overhead. That means this can be committed
// and deployed before the Sentry account exists, and turned on later with an
// environment variable rather than a code change.
//
// Errors only — tracesSampleRate is 0. Performance tracing is the thing that
// burns a free-tier quota fastest, and the problem being solved here is
// "nobody tells me when something throws", not "which route is slow". Raise it
// deliberately later if that changes.

import * as Sentry from '@sentry/nextjs'

export async function register() {
  const dsn = process.env.SENTRY_DSN
  if (!dsn) return

  const common = {
    dsn,
    environment: process.env.VERCEL_ENV ?? 'development',
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    tracesSampleRate: 0,
    // This app handles customer email addresses and postcodes. Default PII
    // capture would attach request headers, cookies and IPs to every event;
    // an error report does not need to carry who it happened to in order to
    // tell us what broke.
    sendDefaultPii: false,
  }

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    Sentry.init(common)
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init(common)
  }
}

// Next calls this for every server-side error it catches, including those
// thrown inside Server Components and Route Handlers.
export const onRequestError = Sentry.captureRequestError
