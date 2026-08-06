'use client'

// GabrielCAM site-monitoring enquiry, shown only to partner accounts.
//
// Gating is belt-and-braces: the parent renders this only when the server has
// already resolved the partnership, and the component itself returns null if
// the flag is false. A non-partner should never see this control, so a wrong
// render anywhere fails to nothing rather than to a visible advert.
//
// There is no GabrielCAM Hub API yet, so the action prepares an enquiry with
// the site details already filled in and hands it over — the same shape as the
// outreach flow, and useful the day it ships rather than the day the Hub does.

import { useState } from 'react'
import { Video, Copy, Check, X, Mail } from 'lucide-react'
import Button from '@/components/ui/Button'
import { useUserFeatures } from './FeaturesProvider'
import { PARTNER_META } from '@/lib/features'
import { useToast } from '@/components/ui/Toast'
import type { PlanningApplication } from '@/types/database'

const META = PARTNER_META.gabrielcam

function buildEnquiry(app: PlanningApplication, hubId: string | null): string {
  return [
    `Site monitoring enquiry — ${app.reference}`,
    '',
    `Council:     ${app.council_slug}`,
    `Reference:   ${app.reference}`,
    app.address ? `Address:     ${app.address}` : null,
    app.application_date ? `Submitted:   ${app.application_date}` : null,
    app.status ? `Status:      ${app.status}` : null,
    hubId ? `Hub ID:      ${hubId}` : null,
    '',
    'Scope:',
    app.description ?? 'No description provided by the council.',
    '',
    'Requesting GabrielCAM monitoring coverage for this site.',
  ]
    .filter((l) => l !== null)
    .join('\n')
}

export default function SiteMonitoringButton({
  app,
  hubId,
}: {
  app: PlanningApplication
  hubId: string | null
}) {
  const { siteMonitoring } = useUserFeatures()
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const { toast } = useToast()

  // Hard stop. Nothing below this line renders for a non-partner.
  if (!siteMonitoring) return null

  const body = buildEnquiry(app, hubId)
  const subject = `Site monitoring enquiry — ${app.reference}`
  const mailto = `mailto:${META.contactEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(body)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast({
        title: 'Couldn’t copy to clipboard',
        description: 'Select the text and copy it manually.',
        variant: 'error',
      })
    }
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Video size={13} className="shrink-0" aria-hidden="true" />
        Deploy site monitoring
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${META.name} site monitoring enquiry`}
            className="w-full max-w-lg rounded-lg bg-surface p-5 shadow-lg sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-base font-semibold tracking-tight text-ink">
                  {META.name} site monitoring
                </h3>
                <p className="tabular-data mt-0.5 text-xs text-ink-muted">{app.reference}</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close enquiry"
                className="-m-1 rounded-sm p-1 text-neutral-500 transition-colors duration-fast ease-standard hover:bg-neutral-100 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45"
              >
                <X size={16} />
              </button>
            </div>

            <p className="mb-3 text-sm leading-relaxed text-ink-muted">
              Site details are filled in below. Send it to {META.name} and they&rsquo;ll come
              back on coverage and cost.
            </p>

            <pre className="max-h-64 overflow-auto rounded-sm border border-border bg-surface-sunken p-3.5 text-xs leading-relaxed text-ink">
              {body}
            </pre>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                Close
              </Button>
              <Button variant="secondary" size="sm" onClick={handleCopy}>
                {copied ? (
                  <>
                    <Check size={13} className="shrink-0" aria-hidden="true" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy size={13} className="shrink-0" aria-hidden="true" />
                    Copy
                  </>
                )}
              </Button>
              <a
                href={mailto}
                className="pp-lift inline-flex h-8 items-center gap-2 rounded-sm bg-primary-500 px-3 text-xs font-medium text-white shadow-sm transition-[background-color,box-shadow,transform] duration-fast ease-standard hover:-translate-y-px hover:bg-primary-600 hover:shadow-primary active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45 focus-visible:ring-offset-2"
              >
                <Mail size={13} className="shrink-0" aria-hidden="true" />
                Email {META.name}
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
