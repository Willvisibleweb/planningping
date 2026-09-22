import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Alert } from '@/components/ui/ErrorState'
import AuthForm from './AuthForm'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ password?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/dashboard')

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Sign in</h1>
        <p className="mt-1 text-sm text-ink-muted">Welcome back</p>
      </div>
      {params.password === 'updated' && (
        <Alert tone="success" className="mb-4">
          Your password has been updated. Sign in with the new password.
        </Alert>
      )}
      <AuthForm />
    </div>
  )
}
