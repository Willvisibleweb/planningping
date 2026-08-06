// Joins class names, dropping anything falsy. Deliberately tiny — the app has
// no clsx/tailwind-merge dependency and doesn't need one, because the UI
// primitives always place the caller's `className` last so it wins on
// conflicts by source order.
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}
