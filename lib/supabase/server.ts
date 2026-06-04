// Server client — used in Server Components, Route Handlers, and Server Actions.
// Reads the user's session from cookies so auth is validated server-side.
// Still constrained by RLS — this is NOT elevated access.

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          } catch {
            // setAll is called from Server Components where cookies can't be set.
            // The middleware handles session refresh, so this is safe to ignore.
          }
        },
      },
    }
  )
}
