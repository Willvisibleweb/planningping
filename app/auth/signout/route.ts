import { revalidatePath } from 'next/cache'
import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  // Local scope signs out only this browser/session. That is faster and avoids
  // unexpectedly logging the same person out on every other device.
  await supabase.auth.signOut({ scope: 'local' })

  revalidatePath('/', 'layout')

  return NextResponse.redirect(new URL('/login', request.url), {
    status: 303,
  })
}
