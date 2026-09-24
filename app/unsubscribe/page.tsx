// Public unsubscribe page — where the "Unsubscribe" link in every customer
// email lands. No login required (proxy.ts only gates the dashboard routes).
//
// Opening the link does not unsubscribe anyone on its own: corporate mail
// scanners open every link in an email, and would otherwise unsubscribe people
// who never clicked. The reader presses a button, which posts to a server
// action that re-checks the signature. Gmail's own one-click button goes to
// /api/unsubscribe instead and needs no page at all.

import type { Metadata } from 'next'
import Link from 'next/link'
import { MailX, MailCheck, TriangleAlert } from 'lucide-react'
import Button from '@/components/ui/Button'
import { verifyUnsubscribe } from '@/lib/email/unsubscribe'
import { unsubscribeAction, resubscribeAction } from './actions'

export const metadata: Metadata = {
  title: 'Unsubscribe — PlanningPing',
  robots: { index: false, follow: false },
}

type State = 'confirm' | 'unsubscribed' | 'resubscribed' | 'error' | 'invalid'

const COPY: Record<State, { icon: typeof MailX; title: string; body: string }> = {
  confirm: {
    icon: MailX,
    title: 'Unsubscribe from PlanningPing emails?',
    body: 'You will stop receiving the weekly digest, new-application alerts and decision alerts. Your account and tracked areas stay as they are.',
  },
  unsubscribed: {
    icon: MailCheck,
    title: 'You’re unsubscribed',
    body: 'We won’t send you any more PlanningPing emails. Your account is unchanged, and you can turn emails back on at any time.',
  },
  resubscribed: {
    icon: MailCheck,
    title: 'Emails are back on',
    body: 'You’ll receive your digest and alerts again from the next send.',
  },
  error: {
    icon: TriangleAlert,
    title: 'We couldn’t update your preferences',
    body: 'Please try again, or turn emails off in your settings.',
  },
  invalid: {
    icon: TriangleAlert,
    title: 'This link isn’t valid',
    body: 'It may have been copied incompletely. Use the unsubscribe link in a recent email, or turn emails off in your settings.',
  },
}

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  const u = typeof params.u === 'string' ? params.u : ''
  const t = typeof params.t === 'string' ? params.t : ''
  const requested = typeof params.state === 'string' ? params.state : ''

  const valid = verifyUnsubscribe(u, t)
  const state: State = !valid
    ? 'invalid'
    : requested === 'unsubscribed' || requested === 'resubscribed' || requested === 'error'
      ? requested
      : 'confirm'

  const { icon: Icon, title, body } = COPY[state]

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-20 text-center">
      <div className="mb-5 grid size-12 place-items-center rounded-full bg-primary-50 text-primary-500 ring-1 ring-inset ring-primary-200">
        <Icon size={22} aria-hidden="true" />
      </div>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
      <p className="mt-2.5 max-w-md text-sm leading-relaxed text-ink-muted">{body}</p>

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {(state === 'confirm' || state === 'error') && (
          <form action={unsubscribeAction}>
            <input type="hidden" name="u" value={u} />
            <input type="hidden" name="t" value={t} />
            <Button type="submit">Unsubscribe</Button>
          </form>
        )}
        {state === 'unsubscribed' && (
          <form action={resubscribeAction}>
            <input type="hidden" name="u" value={u} />
            <input type="hidden" name="t" value={t} />
            <Button type="submit" variant="secondary">Turn emails back on</Button>
          </form>
        )}
        {(state === 'invalid' || state === 'error') && (
          <Link
            href="/settings"
            className="pp-lift inline-flex h-10 items-center rounded-sm border border-border bg-surface px-4 text-sm font-medium text-ink shadow-sm transition-[background-color,border-color,box-shadow,transform] duration-fast ease-standard hover:-translate-y-px hover:border-primary-300 hover:bg-primary-50 hover:shadow-md active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/45 focus-visible:ring-offset-2"
          >
            Go to settings
          </Link>
        )}
        <Link
          href="/"
          className="inline-flex h-10 items-center px-4 text-sm font-medium text-ink-muted hover:text-ink"
        >
          PlanningPing home
        </Link>
      </div>
    </div>
  )
}
