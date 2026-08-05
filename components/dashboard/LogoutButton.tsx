'use client'

import { useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'

export default function LogoutButton() {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleLogout() {
    startTransition(async () => {
      const supabase = createClient()
      await supabase.auth.signOut()
      router.push('/login')
    })
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleLogout}
      loading={isPending}
      loadingLabel="Signing out"
    >
      Sign out
    </Button>
  )
}
