'use client'

// Firm letterhead identity — business name/address/phone/logo, used on
// formal letters generated from a tracked lead (OutreachModal's letter
// mode). Optional: a letter still generates fine with just bracketed
// placeholders if this is left empty.

import { useRef, useState, useTransition } from 'react'
import { saveFirmProfile, uploadFirmLogo, removeFirmLogo } from './firmProfileActions'
import Button from '@/components/ui/Button'
import { Field, Input, Textarea } from '@/components/ui/Input'
import { Alert } from '@/components/ui/ErrorState'
import type { FirmProfile } from '@/types/database'

export default function FirmProfileSection({
  firmProfile,
  logoDataUri,
}: {
  firmProfile: FirmProfile | null
  logoDataUri: string | null
}) {
  const [businessName, setBusinessName] = useState(firmProfile?.business_name ?? '')
  const [address, setAddress] = useState(firmProfile?.address ?? '')
  const [phone, setPhone] = useState(firmProfile?.phone ?? '')
  const [contactEmail, setContactEmail] = useState(firmProfile?.contact_email ?? '')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [logoError, setLogoError] = useState<string | null>(null)
  const [isLogoPending, startLogoTransition] = useTransition()

  function handleSave() {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const formData = new FormData()
      formData.set('businessName', businessName)
      formData.set('address', address)
      formData.set('phone', phone)
      formData.set('contactEmail', contactEmail)
      const result = await saveFirmProfile(formData)
      if (result?.error) {
        setError(result.error)
        return
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    })
  }

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoError(null)
    startLogoTransition(async () => {
      const formData = new FormData()
      formData.set('logo', file)
      const result = await uploadFirmLogo(formData)
      if (result?.error) setLogoError(result.error)
      if (fileInputRef.current) fileInputRef.current.value = ''
    })
  }

  function handleRemoveLogo() {
    setLogoError(null)
    startLogoTransition(async () => {
      const result = await removeFirmLogo()
      if (result?.error) setLogoError(result.error)
    })
  }

  return (
    <div className="rounded-md border border-border bg-surface p-5 sm:p-6 shadow-sm">
      <h3 className="text-sm font-semibold text-ink">Firm letterhead</h3>
      <p className="mt-1 text-xs text-ink-muted">
        Used on formal letters drafted from a tracked lead — business name, address and logo
        appear on the printed letterhead. Optional: letters still generate fine without this.
      </p>

      <div className="mt-3 flex items-center gap-3">
        {logoDataUri ? (
          // eslint-disable-next-line @next/next/no-img-element -- small settings-page thumbnail, no benefit from next/image here
          <img
            src={logoDataUri}
            alt="Firm logo"
            className="h-12 w-auto max-w-[96px] rounded-sm border border-border object-contain"
          />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-sm border border-dashed border-border text-2xs text-ink-muted">
            No logo
          </div>
        )}
        <div>
          <label className="cursor-pointer rounded-md border border-border px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-sunken">
            {isLogoPending ? 'Uploading…' : logoDataUri ? 'Replace logo' : 'Upload logo'}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg"
              onChange={handleLogoChange}
              disabled={isLogoPending}
              className="hidden"
            />
          </label>
          {logoDataUri && (
            <button
              onClick={handleRemoveLogo}
              disabled={isLogoPending}
              className="ml-2 rounded-sm text-xs text-ink-muted transition-colors duration-fast ease-standard hover:text-danger-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45 focus-visible:ring-offset-2 disabled:opacity-40"
            >
              Remove
            </button>
          )}
        </div>
      </div>
      {logoError && (
        <Alert tone="danger" className="mt-3 text-xs">
          {logoError}
        </Alert>
      )}

      <div className="mt-5 space-y-4">
        <Field label="Business name">
          {(p) => (
            <Input {...p} value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
          )}
        </Field>
        <Field label="Address">
          {(p) => (
            <Textarea {...p} rows={3} value={address} onChange={(e) => setAddress(e.target.value)} />
          )}
        </Field>
        <Field label="Phone">
          {(p) => (
            <Input {...p} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          )}
        </Field>
        <Field label="Contact email" hint="Leave blank to use your account email.">
          {(p) => (
            <Input
              {...p}
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="Defaults to your account email"
            />
          )}
        </Field>
      </div>

      <Button size="sm" className="mt-5" onClick={handleSave} loading={isPending} loadingLabel="Saving firm details">
        Save firm details
      </Button>
      {saved && (
        <p className="mt-2.5 text-xs font-medium text-success-600">
          Saved — new letters will use these details.
        </p>
      )}
      {error && (
        <Alert tone="danger" className="mt-3">
          {error}
        </Alert>
      )}
    </div>
  )
}
