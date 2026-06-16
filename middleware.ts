// Middleware runs on every matched request before the page renders.
// Its two jobs:
//   1. Refresh the Supabase session token (keeps users logged in without
//      requiring a page reload — Supabase sessions expire every hour).
//   2. Protect dashboard routes: redirect unauthenticated users to /login.
//
// The actual auth gate for dashboard pages is ALSO in the dashboard layout
// (defence-in-depth). Middleware is fast but can be bypassed by edge cases;
// the layout check is the authoritative guard.

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Max time to wait for Supabase auth before giving up and failing open.
const AUTH_TIMEOUT_MS = 3000

export async function middleware(request: NextRequest) {
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

  // getUser() validates the token against Supabase (a network call). Do NOT use
  // getSession() — it reads the cookie without server validation and can be
  // spoofed. We race getUser() against a timeout so a slow/unreachable/paused
  // Supabase can never hang the request into a MIDDLEWARE_INVOCATION_TIMEOUT.
  // On timeout or error we FAIL OPEN with user = null: protected routes bounce
  // to /login, everything else continues. The dashboard layout re-validates the
  // session server-side, so failing open never exposes protected content.
  let user = null
  try {
    const { data } = await Promise.race([
      supabase.auth.getUser(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('supabase-auth-timeout')), AUTH_TIMEOUT_MS)
      ),
    ])
    user = data.user
  } catch {
    user = null
  }

  const { pathname } = request.nextUrl

  // Redirect unauthenticated users away from dashboard routes.
  const isDashboardRoute = pathname.startsWith('/dashboard') || pathname.startsWith('/settings')
  if (isDashboardRoute && !user) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    return NextResponse.redirect(loginUrl)
  }

  // Redirect logged-in users away from auth pages (no point showing login to
  // someone who is already authenticated).
  const isAuthRoute = pathname === '/login' || pathname === '/signup'
  if (isAuthRoute && user) {
    const dashboardUrl = request.nextUrl.clone()
    dashboardUrl.pathname = '/dashboard'
    return NextResponse.redirect(dashboardUrl)
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
