'use client'

// The in-app counterpart to the unsubscribe link in every email: the same
// switch (profiles.emails_unsubscribed_at), and the only way back on for
// someone who unsubscribed and later lost the email with the link in it.

import { useState, useTransition } from 'react'
import { setEmailsEnabled } from './accountActions'
import Button from '@/components/ui/Button'
import { Alert } from '@/components/ui/ErrorState'

export default function EmailPreferenceSection({ unsubscribedAt }: { unsubscribedAt: string | null }) {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const enabled = unsubscribedAt === null

  function toggle() {
    setError(null)
    startTransition(async () => {
      const result = await setEmailsEnabled(!enabled)
      if (result?.error) setError(result.error)
    })
  }

  return (
    <div className="rounded-md border border-border bg-surface p-5 sm:p-6 shadow-sm">
      <h3 className="text-sm font-semibold text-ink">Emails</h3>
      <p className="mt-1 text-sm text-ink-muted">
        {enabled
          ? 'You receive the weekly digest and any alerts you’ve turned on.'
          : 'You’re unsubscribed. We won’t send you the digest or any alerts.'}
      </p>
      <div className="mt-4">
        <Button
          variant="secondary"
          size="sm"
          onClick={toggle}
          loading={isPending}
          loadingLabel="Saving email preference"
        >
          {enabled ? 'Unsubscribe from all emails' : 'Turn emails back on'}
        </Button>
      </div>
      {error && (
        <Alert tone="danger" className="mt-4">
          {error}
        </Alert>
      )}
    </div>
  )
}
