import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SignupForm from './SignupForm'
import { PRICING } from '@/lib/stripe'

export default async function SignupPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/dashboard')

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Create account</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Start finding the projects worth pursuing
        </p>
        <p className="mt-2 text-xs text-ink-muted">
          {PRICING.trialDays}-day free trial · no card required
        </p>
      </div>
      <SignupForm />
    </div>
  )
}
