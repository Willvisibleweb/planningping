// Proxy runs on every matched request before the page renders.
// Its jobs are deliberately narrow:
//   1. Redirect production aliases to the canonical host.
//   2. Refresh Supabase session cookies only on routes that use auth.
//   3. Optimistically redirect definitely signed-out users from protected
//      routes. The dashboard layout remains the authoritative auth gate.
//
// The actual auth gate for dashboard pages is ALSO in the dashboard layout
// (defence-in-depth). Proxy is fast but can be bypassed by edge cases; the
// layout check is the authoritative guard.

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Max time to wait for Supabase auth before letting the page/layout decide.
const AUTH_TIMEOUT_MS = 1000

// The canonical host. Anything else in production is an alias Vercel assigns
// automatically (planningping.vercel.app and friends), which served the entire
// site on a second address — a duplicate of the whole product that Google was
// free to index, and the name users saw in places we don't control.
const CANONICAL_HOST = 'planningping.com'

const AUTHED_ROUTE_PREFIXES = [
  '/analytics',
  '/applications',
  '/contact',
  '/coverage',
  '/dashboard',
  '/how-it-works',
  '/leads',
  '/onboarding',
  '/pipeline',
  '/settings',
  '/tenders',
  '/two-factor',
  '/update-password',
]

function matchesPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

export async function proxy(request: NextRequest) {
  // Send production traffic to the real domain before anything else runs.
  //
  // Gated on VERCEL_ENV === 'production' deliberately: preview deployments are
  // *.vercel.app by design, and redirecting those would make every pull-request
  // preview bounce to the live site and be untestable.
  if (process.env.VERCEL_ENV === 'production') {
    const host = request.headers.get('host')
    if (host && host !== CANONICAL_HOST && host !== `www.${CANONICAL_HOST}`) {
      const url = request.nextUrl.clone()
      url.host = CANONICAL_HOST
      url.protocol = 'https'
      url.port = ''
      // 308 keeps the method and tells search engines the move is permanent,
      // so link equity consolidates on the real domain instead of splitting.
      return NextResponse.redirect(url, 308)
    }
  }

  const { pathname } = request.nextUrl
  const needsSession = AUTHED_ROUTE_PREFIXES.some((prefix) =>
    matchesPrefix(pathname, prefix)
  )

  // Public/content pages should not pay for a Supabase auth check.
  if (!needsSession) return NextResponse.next({ request })

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // Write refreshed cookies to both the request and response so
          // downstream Server Components see the updated session.
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getClaims() verifies the JWT without the user-record roundtrip when the
  // project uses asymmetric signing keys, while still refreshing cookies via
  // @supabase/ssr. Do NOT use getSession() for route protection; it reads
  // cookie storage without validating the token.
  let authState: 'authenticated' | 'unauthenticated' | 'unknown' = 'unknown'
  try {
    const { data, error } = await Promise.race([
      supabase.auth.getClaims(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('supabase-auth-timeout')), AUTH_TIMEOUT_MS)
      ),
    ])
    authState = !error && data?.claims?.sub ? 'authenticated' : 'unauthenticated'
  } catch {
    authState = 'unknown'
  }

  // Redirect definitely unauthenticated users away from protected routes. If
  // Supabase is slow or unreachable, let the dashboard layout perform its
  // authoritative check instead of accidentally logging out a valid session.
  if (authState === 'unauthenticated') {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    return NextResponse.redirect(loginUrl)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    // Run only on page routes that need session handling. Now also EXCLUDES
    // /api (those routes do their own auth — webhook secret, cron bearer — and
    // must not pay the session-lookup cost) plus Next internals and assets.
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)',
  ],
}
