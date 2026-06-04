import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SignupForm from './SignupForm'

export default async function SignupPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/dashboard')

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-[#111827]">Create account</h1>
        <p className="mt-1 text-sm text-[#6B7280]">Start tracking planning applications</p>
      </div>
      <SignupForm />
    </div>
  )
}
