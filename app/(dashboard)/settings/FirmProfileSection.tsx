'use client'

// Firm letterhead identity — business name/address/phone/logo, used on
// formal letters generated from a tracked lead (OutreachModal's letter
// mode). Optional: a letter still generates fine with just bracketed
// placeholders if this is left empty.

import { useRef, useState, useTransition } from 'react'
import { saveFirmProfile, uploadFirmLogo, removeFirmLogo } from './firmProfileActions'
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
    <div className="rounded-lg border border-[#D6E4FB] bg-white p-5">
      <h3 className="text-sm font-semibold text-[#202124]">Firm letterhead</h3>
      <p className="mt-1 text-xs text-[#A0A1A6]">
        Used on formal letters drafted from a tracked lead — business name, address and logo
        appear on the printed letterhead. Optional: letters still generate fine without this.
      </p>

      <div className="mt-3 flex items-center gap-3">
        {logoDataUri ? (
          // eslint-disable-next-line @next/next/no-img-element -- small settings-page thumbnail, no benefit from next/image here
          <img
            src={logoDataUri}
            alt="Firm logo"
            className="h-12 w-auto max-w-[96px] rounded border border-[#D6E4FB] object-contain"
          />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded border border-dashed border-[#D6E4FB] text-[9px] text-[#A0A1A6]">
            No logo
          </div>
        )}
        <div>
          <label className="cursor-pointer rounded-md border border-[#D6E4FB] px-3 py-1.5 text-xs font-medium text-[#202124] hover:bg-[#F7F7F8]">
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
              className="ml-2 text-xs text-red-500 hover:text-red-700 disabled:opacity-40"
            >
              Remove
            </button>
          )}
        </div>
      </div>
      {logoError && <p className="mt-1 text-xs text-red-600">{logoError}</p>}

      <div className="mt-4 space-y-3">
        <div>
          <label className="block text-xs font-medium text-[#6B6C70]">Business name</label>
          <input
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            className="mt-1 w-full rounded-md border border-[#D6E4FB] px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[#6B6C70]">Address</label>
          <textarea
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-md border border-[#D6E4FB] px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[#6B6C70]">Phone</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-1 w-full rounded-md border border-[#D6E4FB] px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[#6B6C70]">Contact email</label>
          <input
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="Defaults to your account email"
            className="mt-1 w-full rounded-md border border-[#D6E4FB] px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
          />
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={isPending}
        className="mt-4 rounded-md bg-[#2563EB] px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[#1D4ED8] disabled:opacity-50"
      >
        {isPending ? 'Saving…' : 'Save firm details'}
      </button>
      {saved && <p className="mt-2 text-xs font-medium text-green-700">Saved.</p>}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  )
}
