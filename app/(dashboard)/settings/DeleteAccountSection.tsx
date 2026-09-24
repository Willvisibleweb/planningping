'use client'

// Permanent account deletion. Two steps on purpose: a button that only opens
// the confirmation, then typing the account's email to enable the real one —
// so neither a stray click nor a double-click can delete an account.

import { useState, useTransition } from 'react'
import { deleteAccount } from './accountActions'
import Button from '@/components/ui/Button'
import { Alert } from '@/components/ui/ErrorState'
import { Field, Input } from '@/components/ui/Input'

export default function DeleteAccountSection({
  email,
  hasSubscription,
}: {
  email: string
  hasSubscription: boolean
}) {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const matches = typed.trim().toLowerCase() === email.toLowerCase()

  function handleDelete() {
    setError(null)
    startTransition(async () => {
      // On success the action redirects, so a result only ever means failure.
      const result = await deleteAccount(typed)
      if (result?.error) setError(result.error)
    })
  }

  return (
    <div className="rounded-md border border-danger-200 bg-surface p-5 sm:p-6 shadow-sm">
      <h3 className="text-sm font-semibold text-ink">Delete account</h3>
      <p className="mt-1 text-sm text-ink-muted">
        Permanently delete your account and everything in it: tracked areas, leads, pipeline,
        notes, profiles and letterhead. This can’t be undone.
      </p>

      {!open ? (
        <div className="mt-4">
          <Button variant="danger" size="sm" onClick={() => setOpen(true)}>
            Delete my account
          </Button>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <Alert tone="warning" title="Are you sure?">
            Your data will be deleted straight away and can’t be recovered.
            {hasSubscription &&
              ' Your subscription will be cancelled immediately, with no further charges.'}
          </Alert>

          <Field label={`Type ${email} to confirm`} error={error}>
            {(props) => (
              <Input
                {...props}
                type="email"
                autoComplete="off"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={email}
              />
            )}
          </Field>

          <div className="flex flex-wrap gap-3">
            <Button
              variant="danger"
              size="sm"
              onClick={handleDelete}
              disabled={!matches}
              loading={isPending}
              loadingLabel="Deleting your account"
            >
              Permanently delete my account
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setOpen(false)
                setTyped('')
                setError(null)
              }}
              disabled={isPending}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
