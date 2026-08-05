// Contact us — a plain mailto page, not a submitting form. Building a real
// contact form means a backend endpoint + somewhere for replies to land;
// until that's wanted, a direct mailto is honest (it does exactly what it
// says) rather than a form that implies infrastructure that doesn't exist.
//
// CONTACT_EMAIL is a placeholder — confirm/replace with the address you
// actually want customer enquiries landing in before this goes live.
const CONTACT_EMAIL = 'william.kelwave@gmail.com'

export default function ContactPage() {
  return (
    <div className="pp-stagger max-w-lg space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-ink mb-1">Contact us</h2>
        <p className="text-sm text-ink-muted">
          Questions, a council we don&rsquo;t cover yet, or something not working as expected —
          get in touch and we&rsquo;ll get back to you.
        </p>
      </div>

      <div className="rounded-md border border-border bg-surface p-5 sm:p-6 shadow-sm">
        <p className="text-sm text-ink-muted">Email us directly at</p>
        <a
          href={`mailto:${CONTACT_EMAIL}`}
          className="mt-1 inline-block text-base font-semibold text-primary-500 hover:underline"
        >
          {CONTACT_EMAIL}
        </a>
        <p className="mt-3 text-xs text-ink-muted">
          We typically reply within a day or two.
        </p>
      </div>
    </div>
  )
}
