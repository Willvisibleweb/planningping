'use client'

import { useState, useTransition } from 'react'
import { updatePassword } from './actions'
import Button from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { Alert } from '@/components/ui/ErrorState'

export default function UpdatePasswordForm() {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const result = await updatePassword(formData)
      if (result?.error) setError(result.error)
    })
  }

  return (
    <form action={handleSubmit} className="space-y-5">
      <Field label="New password" hint="Use at least 8 characters.">
        {(p) => (
          <Input
            {...p}
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
          />
        )}
      </Field>

      <Field label="Confirm new password">
        {(p) => (
          <Input
            {...p}
            name="confirm_password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
          />
        )}
      </Field>

      {error && <Alert tone="danger">{error}</Alert>}

      <Button type="submit" fullWidth loading={isPending} loadingLabel="Updating password">
        Update password
      </Button>
    </form>
  )
}
