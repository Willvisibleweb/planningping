'use client'

import { useId } from 'react'
import { AlertCircle } from 'lucide-react'
import { cn } from '@/lib/cn'

// Form fields with a designed focus ring rather than the browser default, and
// validation messaging that says what to fix.
//
// Field wires up the label, the error and the input's aria-* attributes from
// one place, so no call site has to remember aria-describedby — which is how
// error text ends up announced to nobody.

const CONTROL =
  'w-full rounded-sm border bg-surface px-3 py-2 text-sm text-ink ' +
  'placeholder:text-neutral-500 ' +
  'transition-[border-color,box-shadow] duration-fast ease-standard ' +
  'focus:outline-none focus-visible:outline-none ' +
  'disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-500'

const CONTROL_DEFAULT =
  'border-border hover:border-primary-300 focus:border-primary-500 focus:ring-4 focus:ring-primary-500/15'

const CONTROL_INVALID =
  'border-danger-600 focus:border-danger-600 focus:ring-4 focus:ring-danger-600/15'

function controlClasses(invalid: boolean, className?: string) {
  return cn(CONTROL, invalid ? CONTROL_INVALID : CONTROL_DEFAULT, className)
}

export function Label({
  className,
  children,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={cn('block text-sm font-medium text-ink', className)} {...props}>
      {children}
    </label>
  )
}

export function FieldError({ children }: { children: React.ReactNode }) {
  if (!children) return null
  return (
    <p className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-danger-600">
      <AlertCircle size={13} className="mt-px shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  )
}

export function FieldHint({ children }: { children: React.ReactNode }) {
  if (!children) return null
  return <p className="mt-1.5 text-xs text-ink-muted">{children}</p>
}

/**
 * Wraps a control with its label, hint and error, and passes the wiring down
 * via a render prop so the control gets matching id/aria attributes.
 */
export function Field({
  label,
  error,
  hint,
  required,
  labelAction,
  className,
  children,
}: {
  label: string
  error?: string | null
  hint?: React.ReactNode
  required?: boolean
  /** Optional control aligned to the label's right — e.g. "Forgot password?". */
  labelAction?: React.ReactNode
  className?: string
  children: (props: {
    id: string
    'aria-invalid': boolean | undefined
    'aria-describedby': string | undefined
    invalid: boolean
  }) => React.ReactNode
}) {
  const id = useId()
  const errorId = `${id}-error`
  const hintId = `${id}-hint`
  const invalid = Boolean(error)

  const describedBy = [error ? errorId : null, hint ? hintId : null]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={className}>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <Label htmlFor={id}>
          {label}
          {required && (
            <span className="ml-0.5 text-danger-600" aria-hidden="true">
              *
            </span>
          )}
        </Label>
        {labelAction}
      </div>

      {children({
        id,
        'aria-invalid': invalid || undefined,
        'aria-describedby': describedBy || undefined,
        invalid,
      })}

      {error && (
        <p
          id={errorId}
          className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-danger-600"
        >
          <AlertCircle size={13} className="mt-px shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}
      {hint && !error && (
        <p id={hintId} className="mt-1.5 text-xs text-ink-muted">
          {hint}
        </p>
      )}
    </div>
  )
}

export function Input({
  invalid = false,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input className={controlClasses(invalid, className)} {...props} />
}

export function Textarea({
  invalid = false,
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return (
    <textarea
      className={controlClasses(invalid, cn('min-h-24 resize-y', className))}
      {...props}
    />
  )
}

export function Select({
  invalid = false,
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return (
    <select className={controlClasses(invalid, cn('pr-8', className))} {...props}>
      {children}
    </select>
  )
}
