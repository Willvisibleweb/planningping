'use client'

// The detail-page action is intentionally tiny: tracking remains in the
// existing RLS-protected pipeline, rather than creating a second saved-project
// mechanism for the new intelligence page.

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Check, Plus } from 'lucide-react'
import { trackOpportunity } from './leadActions'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'

export default function TrackOpportunityButton({
  applicationId,
  reference,
  initiallyTracked,
  canTrack,
}: {
  applicationId: string
  reference: string
  initiallyTracked: boolean
  canTrack: boolean
}) {
  const [tracked, setTracked] = useState(initiallyTracked)
  const [pending, startTransition] = useTransition()
  const { toast } = useToast()

  if (tracked) {
    return (
      <Link
        href="/pipeline"
        className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-success-200 bg-success-50 px-3 text-sm font-medium text-success-700 transition-colors hover:bg-success-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45 focus-visible:ring-offset-2"
      >
        <Check size={15} aria-hidden="true" />
        In pipeline
      </Link>
    )
  }

  if (!canTrack) {
    return (
      <Link
        href="/settings#billing"
        className="inline-flex h-9 items-center rounded-sm border border-border bg-surface px-3 text-sm font-medium text-ink transition-colors hover:border-primary-300 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45 focus-visible:ring-offset-2"
      >
        Unlock pipeline
      </Link>
    )
  }

  function addToPipeline() {
    startTransition(async () => {
      const result = await trackOpportunity(applicationId)
      if (!result?.error || result.error.startsWith('Already')) {
        setTracked(true)
        toast({
          title: 'Added to your pipeline',
          description: `${reference} is now at your first pipeline stage.`,
          variant: 'success',
        })
        return
      }
      toast({ title: 'Couldn’t add this opportunity', description: result.error, variant: 'error' })
    })
  }

  return (
    <Button size="sm" onClick={addToPipeline} loading={pending} loadingLabel="Adding to pipeline">
      <Plus size={15} aria-hidden="true" />
      Add to pipeline
    </Button>
  )
}
