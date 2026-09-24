// Browser error reporting.
//
// Inert until NEXT_PUBLIC_SENTRY_DSN is set. Note the NEXT_PUBLIC_ prefix: this
// value is compiled into the browser bundle and is therefore public. That is
// how Sentry DSNs work — a DSN only permits sending events, it grants no read
// access to the project — but it does mean the variable must be set in Vercel
// at BUILD time, not just at runtime, or the browser never picks it up.
//
// Errors only, no performance tracing. See instrumentation.ts.
//
// The browser SDK does not take sendDefaultPii — that is a server option — and
// defaults to not attaching personal data, which is what we want on pages
// showing customer email addresses and postcodes.

import * as Sentry from '@sentry/nextjs'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? 'development',
    release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
    tracesSampleRate: 0,
  })
}

// Lets Sentry tie an error to the navigation that was in flight when it
// happened, which is most of what makes a client-side stack trace readable.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
