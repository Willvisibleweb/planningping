// Public client — the anon key with no session and no cookies. For reading
// data anyone may see (the views and tables RLS already opens to anon) on
// public pages.
//
// Why not lib/supabase/server.ts: that one calls cookies(), and reading
// cookies tells Next the page is different for every visitor. That silently
// switches off `export const revalidate`, so a page meant to be built once an
// hour is rebuilt — queries and all — on every single visit. That is exactly
// what happened to the homepage: 2.5–4.4s to first byte instead of a cached
// response.
//
// Same privileges as a logged-out visitor, so it is safe anywhere; it just
// can't see anything a logged-in user owns.

import { createClient } from '@supabase/supabase-js'

export function createPublicClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}
