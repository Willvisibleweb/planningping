'use client'

import { useState, useTransition } from 'react'
import { ThumbsDown, ThumbsUp } from 'lucide-react'
import { saveOpportunityFeedback } from './opportunityFeedbackActions'
import Button from '@/components/ui/Button'
import { Select } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import type { OpportunityFeedbackReason, OpportunityFeedbackVerdict } from '@/types/database'

const REASONS: { value: OpportunityFeedbackReason; label: string }[] = [
  { value: 'too_small', label: 'Too small' },
  { value: 'too_large', label: 'Too large' },
  { value: 'wrong_sector', label: 'Wrong sector' },
  { value: 'wrong_location', label: 'Wrong location' },
  { value: 'wrong_project_type', label: 'Wrong type of project' },
  { value: 'too_early', label: 'Too early' },
  { value: 'too_late', label: 'Too late' },
  { value: 'not_a_service', label: 'Not a service we provide' },
  { value: 'other', label: 'Other' },
]

export default function OpportunityFeedbackButtons({
  applicationId,
  profileId,
  initialVerdict,
  compact = false,
}: {
  applicationId: string
  profileId: string | null
  initialVerdict?: OpportunityFeedbackVerdict | null
  compact?: boolean
}) {
  const [verdict, setVerdict] = useState<OpportunityFeedbackVerdict | null>(initialVerdict ?? null)
  const [reason, setReason] = useState<OpportunityFeedbackReason | ''>('')
  const [pending, startTransition] = useTransition()
  const { toast } = useToast()

  function submit(nextVerdict: OpportunityFeedbackVerdict, nextReason?: OpportunityFeedbackReason | '') {
    startTransition(async () => {
      const formData = new FormData()
      formData.set('applicationId', applicationId)
      if (profileId) formData.set('profileId', profileId)
      formData.set('verdict', nextVerdict)
      if (nextVerdict === 'not_relevant' && nextReason) formData.set('reason', nextReason)

      const result = await saveOpportunityFeedback(formData)
      if (result?.error) {
        toast({ title: 'Couldn’t save feedback', description: result.error, variant: 'error' })
        return
      }
      setVerdict(nextVerdict)
      toast({
        title: nextVerdict === 'good' ? 'Marked as useful' : 'Marked as not relevant',
        description: 'PlanningPing will use this signal when ranking opportunities.',
        variant: 'success',
      })
    })
  }

  return (
    <div className={compact ? 'flex flex-wrap items-center gap-2' : 'space-y-2'}>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={verdict === 'good' ? 'primary' : 'secondary'}
          onClick={() => submit('good')}
          loading={pending && verdict !== 'good'}
          loadingLabel="Saving feedback"
        >
          <ThumbsUp size={14} aria-hidden="true" />
          Good opportunity
        </Button>
        <Button
          type="button"
          size="sm"
          variant={verdict === 'not_relevant' ? 'danger' : 'ghost'}
          onClick={() => submit('not_relevant', reason)}
          loading={pending && verdict !== 'not_relevant'}
          loadingLabel="Saving feedback"
        >
          <ThumbsDown size={14} aria-hidden="true" />
          Not relevant
        </Button>
      </div>

      {(verdict === 'not_relevant' || !compact) && (
        <div className={compact ? 'w-full sm:w-56' : 'max-w-xs'}>
          <label htmlFor={`reason-${applicationId}`} className="sr-only">
            Reason this opportunity is not relevant
          </label>
          <Select
            id={`reason-${applicationId}`}
            value={reason}
            onChange={(e) => {
              const value = e.target.value as OpportunityFeedbackReason | ''
              setReason(value)
              if (verdict === 'not_relevant') submit('not_relevant', value)
            }}
            className="h-8 py-1.5 text-xs"
          >
            <option value="">Optional reason</option>
            {REASONS.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </Select>
        </div>
      )}
    </div>
  )
}
