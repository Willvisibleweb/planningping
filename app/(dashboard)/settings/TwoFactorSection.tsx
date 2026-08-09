'use client'

// Two-factor setup. Optional — nothing forces a user through this, and an
// account with it switched off behaves exactly as before.

import { useState, useTransition } from 'react'
import { ShieldCheck, ShieldAlert, Copy, Check } from 'lucide-react'
import { startTotpEnrolment, confirmTotpEnrolment, disableTotp } from './mfaActions'
import Button from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { Alert } from '@/components/ui/ErrorState'
import { useToast } from '@/components/ui/Toast'

type Stage = 'idle' | 'scanning'

export default function TwoFactorSection({ enabled }: { enabled: boolean }) {
  const [stage, setStage] = useState<Stage>('idle')
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [factorId, setFactorId] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [isPending, startTransition] = useTransition()
  const { toast } = useToast()

  function begin() {
    setError(null)
    startTransition(async () => {
      const result = await startTotpEnrolment()
      if (!result.ok) {
        setError(result.error)
        return
      }
      setFactorId(result.data.factorId)
      setQrCode(result.data.qrCode)
      setSecret(result.data.secret)
      setStage('scanning')
    })
  }

  function confirm() {
    if (!factorId) return
    setError(null)
    startTransition(async () => {
      const result = await confirmTotpEnrolment(factorId, code)
      if (result?.error) {
        setError(result.error)
        return
      }
      setStage('idle')
      setQrCode(null)
      setSecret(null)
      setCode('')
      toast({
        title: 'Two-factor authentication is on',
        description: 'You’ll be asked for a code from your app each time you sign in.',
        variant: 'success',
      })
    })
  }

  function turnOff() {
    setError(null)
    startTransition(async () => {
      const result = await disableTotp()
      if (result?.error) {
        setError(result.error)
        return
      }
      toast({
        title: 'Two-factor authentication is off',
        description: 'Signing in now needs only your password.',
        variant: 'success',
      })
    })
  }

  async function copySecret() {
    if (!secret) return
    try {
      await navigator.clipboard.writeText(secret)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast({ title: 'Couldn’t copy', description: 'Select the code and copy it manually.', variant: 'error' })
    }
  }

  return (
    <div className="rounded-md border border-border bg-surface p-5 sm:p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <div
          className={`grid size-9 shrink-0 place-items-center rounded-sm ${
            enabled ? 'bg-success-50 text-success-600' : 'bg-neutral-100 text-ink-muted'
          }`}
        >
          {enabled ? <ShieldCheck size={17} aria-hidden="true" /> : <ShieldAlert size={17} aria-hidden="true" />}
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink">Two-factor authentication</h3>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">
            {enabled
              ? 'On. Signing in needs your password and a code from your authenticator app.'
              : 'Off. Adding it means a stolen password isn’t enough to get into your account on its own.'}
          </p>
        </div>
      </div>

      {stage === 'idle' && (
        <div className="mt-5">
          {enabled ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={turnOff}
              loading={isPending}
              loadingLabel="Turning off two-factor authentication"
            >
              Turn off
            </Button>
          ) : (
            <Button size="sm" onClick={begin} loading={isPending} loadingLabel="Starting setup">
              Set up two-factor authentication
            </Button>
          )}
        </div>
      )}

      {stage === 'scanning' && qrCode && (
        <div className="mt-5 space-y-4">
          <ol className="space-y-3 text-sm text-ink-muted">
            <li>
              <span className="font-medium text-ink">1.</span> Open an authenticator app —
              Google Authenticator, Authy, or 1Password all work.
            </li>
            <li>
              <span className="font-medium text-ink">2.</span> Scan this code.
            </li>
          </ol>

          {/* Supabase returns the QR as a ready-to-use data URL, so no QR
              library is needed. Bordered on white because a QR on a tinted or
              dark surface will not scan reliably. */}
          <div className="inline-block rounded-sm border border-border bg-white p-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- data URL from Supabase, not an optimisable asset */}
            <img src={qrCode} alt="QR code for setting up two-factor authentication" width={180} height={180} />
          </div>

          {secret && (
            <div>
              <p className="text-xs text-ink-muted">Can’t scan it? Type this into the app instead:</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <code className="tabular-data rounded-sm bg-surface-sunken px-2.5 py-1.5 text-xs text-ink ring-1 ring-inset ring-neutral-200">
                  {secret}
                </code>
                <Button variant="ghost" size="sm" onClick={copySecret}>
                  {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </div>
          )}

          <Field label="3. Enter the 6-digit code it shows" className="max-w-[12rem]">
            {(p) => (
              <Input
                {...p}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                maxLength={7}
                className="tabular-data text-center text-lg tracking-[0.3em]"
              />
            )}
          </Field>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={confirm} loading={isPending} loadingLabel="Checking the code">
              Turn on
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setStage('idle')
                setQrCode(null)
                setSecret(null)
                setCode('')
                setError(null)
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {error && (
        <Alert tone="danger" className="mt-4">
          {error}
        </Alert>
      )}

      {enabled && stage === 'idle' && (
        <p className="mt-4 text-xs leading-relaxed text-ink-muted">
          Lost your phone? Email us and we’ll remove it from your account so you can sign in
          with your password and set it up again.
        </p>
      )}
    </div>
  )
}
