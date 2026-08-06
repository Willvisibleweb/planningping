'use client'

// Lets an existing account declare (or drop) a partner integration — the
// signup question only reaches new accounts, so without this every current
// user would be permanently outside the partner segment.

import { useState, useTransition } from 'react'
import { Video } from 'lucide-react'
import { setPartnership } from './partnershipActions'
import { PARTNER_META } from '@/lib/features'
import Button from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { Alert } from '@/components/ui/ErrorState'
import { useToast } from '@/components/ui/Toast'
import type { Profile } from '@/types/database'

const META = PARTNER_META.gabrielcam

export default function PartnershipSection({ profile }: { profile: Profile }) {
  const [isPartner, setIsPartner] = useState(profile.partnership_provider === 'gabrielcam')
  const [hubId, setHubId] = useState(profile.partner_hub_id ?? '')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const { toast } = useToast()

  const professional = profile.user_type === 'professional'
  const dirty =
    isPartner !== (profile.partnership_provider === 'gabrielcam') ||
    hubId !== (profile.partner_hub_id ?? '')

  function handleSave() {
    setError(null)
    const formData = new FormData()
    if (isPartner) {
      formData.set('partnership_provider', 'gabrielcam')
      if (hubId.trim()) formData.set('partner_hub_id', hubId.trim())
    }

    startTransition(async () => {
      const result = await setPartnership(formData)
      if (result?.error) {
        setError(result.error)
        return
      }
      toast({
        title: isPartner ? `${META.name} features enabled` : `${META.name} features turned off`,
        description: isPartner
          ? 'Site monitoring options now appear on applications you track.'
          : 'Your dashboard is back to the standard view.',
        variant: 'success',
      })
    })
  }

  return (
    <div className="rounded-md border border-border bg-surface p-5 sm:p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-sm bg-primary-100 text-primary-600">
          <Video size={17} aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink">Partner integrations</h3>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">
            {META.description} Turn this on to add site-monitoring options to applications
            you track. It changes nothing else about your account.
          </p>
        </div>
      </div>

      {!professional ? (
        <p className="mt-4 text-xs leading-relaxed text-ink-muted">
          Partner integrations are available on professional accounts. Switch your account
          type above to enable them.
        </p>
      ) : (
        <>
          <label className="-mx-2 mt-5 flex cursor-pointer items-center gap-2.5 rounded-sm p-2 text-sm text-ink transition-colors duration-fast ease-standard hover:bg-primary-50/60 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary-500/45">
            <input
              type="checkbox"
              checked={isPartner}
              onChange={(e) => setIsPartner(e.target.checked)}
              disabled={isPending}
              className="size-4 shrink-0 accent-primary-500 focus-visible:outline-none"
            />
            I&rsquo;m a {META.name} partner or client
          </label>

          {isPartner && (
            <Field
              label={`${META.name} Hub ID`}
              className="mt-4 max-w-xs"
              hint="Optional. Helps GabrielCAM match an enquiry to your account."
            >
              {(p) => (
                <Input
                  {...p}
                  value={hubId}
                  onChange={(e) => setHubId(e.target.value)}
                  placeholder="e.g. GC-10482"
                  disabled={isPending}
                  autoComplete="off"
                />
              )}
            </Field>
          )}

          {dirty && (
            <Button
              size="sm"
              className="mt-5"
              onClick={handleSave}
              loading={isPending}
              loadingLabel="Saving partner settings"
            >
              Save partner settings
            </Button>
          )}

          {error && (
            <Alert tone="danger" className="mt-4">
              {error}
            </Alert>
          )}
        </>
      )}
    </div>
  )
}
