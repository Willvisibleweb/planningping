'use client'

import { useState } from 'react'
import { MapPin, Inbox, CheckCircle2, Clock, XCircle } from 'lucide-react'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import ErrorState, { Alert } from '@/components/ui/ErrorState'
import { Card, CardHeader, CardTitle, CardDescription, CardBody, CardFooter } from '@/components/ui/Card'
import { Field, Input, Textarea, Select } from '@/components/ui/Input'
import { Skeleton, SkeletonStatTile, SkeletonRow, SkeletonText } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        {note && <p className="mt-1 text-sm text-ink-muted">{note}</p>}
      </div>
      {children}
    </section>
  )
}

export default function PreviewClient() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  function fakeRequest() {
    setLoading(true)
    setTimeout(() => {
      setLoading(false)
      toast({
        title: 'Territory added',
        description: 'SW1A 1AA is now monitored. First results land within the hour.',
        variant: 'success',
      })
    }, 1600)
  }

  return (
    <div className="mx-auto max-w-4xl px-5 py-12 sm:px-8">
      <header className="mb-12">
        <p className="text-2xs font-semibold uppercase tracking-wider text-primary-500">
          Development only
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-ink">Design system</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-muted">
          Every primitive the redesign is built from. This route 404s in production.
        </p>
      </header>

      <div className="space-y-14">
        <Section title="Type" note="IBM Plex Sans for the interface, Plex Mono for data.">
          <Card>
            <CardBody className="space-y-3">
              <h1 className="text-4xl font-semibold text-ink">Planning applications</h1>
              <h2 className="text-2xl font-semibold text-ink">Your territory</h2>
              <h3 className="text-lg font-semibold text-ink">Recent activity</h3>
              <p className="max-w-prose text-sm text-ink-muted">
                Body copy sits at a 1.65 line-height so long descriptions pulled from
                council portals stay readable. Headings tighten as they scale.
              </p>
              <p className="tabular-data text-sm text-ink">24/01234/FUL · 12/03/2026 · 51.5014, −0.1419</p>
            </CardBody>
          </Card>
        </Section>

        <Section title="Buttons" note="Hover lifts 1px, active presses down, loading holds width.">
          <Card>
            <CardBody className="flex flex-wrap items-center gap-3">
              <Button onClick={fakeRequest} loading={loading}>Add territory</Button>
              <Button variant="secondary">Export</Button>
              <Button variant="ghost">Cancel</Button>
              <Button variant="danger">Delete area</Button>
              <Button disabled>Disabled</Button>
              <Button size="sm" variant="secondary">Small</Button>
            </CardBody>
            <CardFooter>
              <p className="text-xs text-ink-muted">
                Click <span className="font-medium text-ink">Add territory</span> — the button
                keeps its exact width while loading, then fires a toast.
              </p>
            </CardFooter>
          </Card>
        </Section>

        <Section title="Badges">
          <Card>
            <CardBody className="flex flex-wrap items-center gap-2">
              <Badge tone="success" icon={CheckCircle2}>Approved</Badge>
              <Badge tone="warning" icon={Clock}>Pending consideration</Badge>
              <Badge tone="danger" icon={XCircle}>Refused</Badge>
              <Badge tone="primary">HOT</Badge>
              <Badge tone="neutral">Status not available</Badge>
            </CardBody>
          </Card>
        </Section>

        <Section title="Forms" note="Designed focus ring; validation says what to fix.">
          <Card>
            <CardBody className="max-w-md space-y-5">
              <Field label="Postcode" required hint="We identify the planning authority automatically.">
                {(p) => <Input {...p} placeholder="e.g. SW1A 1AA" />}
              </Field>
              <Field
                label="Label"
                error={err ?? undefined}
              >
                {(p) => <Input {...p} placeholder="e.g. Midlands Patch" />}
              </Field>
              <Field label="Council">
                {(p) => (
                  <Select {...p}>
                    <option>Westminster</option>
                    <option>Southwark</option>
                  </Select>
                )}
              </Field>
              <Field label="Notes">{(p) => <Textarea {...p} placeholder="Optional" />}</Field>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setErr(err ? null : 'Add a label so you can tell this territory from the others.')}
              >
                Toggle validation error
              </Button>
            </CardBody>
          </Card>
        </Section>

        <Section title="Alerts and errors" note="No apologies, no vagueness.">
          <div className="space-y-3">
            <Alert tone="danger" title="Couldn’t reach Westminster’s portal">
              The council’s planning system is down. Monitoring resumes automatically —
              nothing in your territory is lost.
            </Alert>
            <Alert tone="warning">Two of your territories share a planning authority.</Alert>
            <Alert tone="info">Results refresh every morning at 07:00.</Alert>
            <Card><ErrorState description="Westminster’s portal didn’t respond. Your saved territories are unaffected." action={<Button variant="secondary" size="sm">Try again</Button>} /></Card>
          </div>
        </Section>

        <Section title="Empty states" note="What appears here, and how to make it appear.">
          <Card>
            <EmptyState
              icon={MapPin}
              title="No territories yet"
              description="Add a postcode and PlanningPing starts monitoring every application within your chosen radius."
              action={<Button size="sm">Add your first territory</Button>}
            />
          </Card>
          <Card>
            <EmptyState
              size="sm"
              icon={Inbox}
              title="No applications this week"
              description="New submissions in this territory will appear here as councils publish them."
            />
          </Card>
        </Section>

        <Section title="Loading" note="Shaped like the content, not a centred spinner.">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <SkeletonStatTile /><SkeletonStatTile /><SkeletonStatTile /><SkeletonStatTile />
          </div>
          <Card>
            <CardHeader>
              <div className="w-full">
                <Skeleton className="h-3.5 w-40" />
                <Skeleton className="mt-2 h-2.5 w-56" />
              </div>
            </CardHeader>
            <CardBody className="divide-y divide-border py-0">
              <SkeletonRow /><SkeletonRow /><SkeletonRow />
            </CardBody>
          </Card>
          <Card><CardBody><SkeletonText lines={4} /></CardBody></Card>
        </Section>

        <Section title="Toasts">
          <Card>
            <CardBody className="flex flex-wrap gap-3">
              <Button variant="secondary" size="sm" onClick={() => toast({ title: 'Opportunity tracked', description: 'Added to your pipeline.', variant: 'success' })}>Success</Button>
              <Button variant="secondary" size="sm" onClick={() => toast({ title: 'Couldn’t save', description: 'Your firm profile needs a company name before it can be saved.', variant: 'error' })}>Error</Button>
              <Button variant="secondary" size="sm" onClick={() => toast({ title: 'Digest sent', variant: 'info' })}>Info</Button>
            </CardBody>
          </Card>
        </Section>

        <Section title="Cards" note="Interactive cards lift; static ones don’t.">
          <Card interactive>
            <CardHeader>
              <div>
                <CardTitle>Midlands Patch</CardTitle>
                <CardDescription>ST13 · Staffordshire Moorlands · 5km radius</CardDescription>
              </div>
              <Badge tone="primary">12 new</Badge>
            </CardHeader>
            <CardBody><SkeletonText lines={2} /></CardBody>
            <CardFooter><Button size="sm" variant="secondary">View territory</Button></CardFooter>
          </Card>
        </Section>
      </div>
    </div>
  )
}
