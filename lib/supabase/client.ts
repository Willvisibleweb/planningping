// Browser client — used only inside Client Components ("use client").
// Uses the anon key, which is safe to expose publicly.
// All queries are constrained by RLS policies.

import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
