// Admin client — uses the service role key, which BYPASSES RLS entirely.
// Only import this file from server-side code (Route Handlers, Server Actions).
// NEVER import it from Client Components or any file that ships to the browser.
// The service role key must stay secret — if it leaks, anyone can read all data.

import { createClient } from '@supabase/supabase-js'

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        // Disable session persistence — admin client is stateless per-request.
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}
