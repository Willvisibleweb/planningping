import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import UpdatePasswordForm from './UpdatePasswordForm'

export default async function UpdatePasswordPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/reset-password')

  return (
    <div>
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Choose a new password</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Once it is updated, you&rsquo;ll sign in again with the new password.
        </p>
      </div>
      <UpdatePasswordForm />
    </div>
  )
}
