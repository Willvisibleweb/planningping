// Full content for a location page. Async Server Component — all data fetching
// happens here so the application list is in the server-rendered HTML. The only
// Client Component on the page is <AlertForm/>.

import AlertForm from '@/components/seo/AlertForm'
import { getLocationsByTier, type SeoLocation } from '@/lib/seo/locations'
import {
  getLocationApplications,
  getCouncilPortalMap,
  portalSearchUrl,
  computeStats,
  buildSummary,
  type PublicApplication,
} from '@/lib/seo/applications'
import {
  getTownsForCouncil,
  getPostcodesForCouncil,
  getCouncilsForPostcode,
  councilHref,
  townHref,
  postcodeHref,
  type LinkItem,
} from '@/lib/seo/links'

function statusClasses(status: string | null): string {
  const s = (status ?? '').toLowerCase()
  if (/approv|grant|permit/.test(s)) return 'bg-[#ECFDF5] text-[#047857]'
  if (/refus|reject|withdraw|dismiss/.test(s)) return 'bg-[#FEF2F2] text-[#B91C1C]'
  if (/pending|await|consult|valid|registered/.test(s)) return 'bg-[#FFFBEB] text-[#B45309]'
  return 'bg-gray-100 text-gray-600'
}

function niceDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(`${iso}T00:00:00Z`)
  if (isNaN(d.getTime())) return iso
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

// Per-tier display strings.
function presentation(location: SeoLocation, councilName?: string) {
  if (location.tier === 'postcode') {
    return {
      eyebrow: 'Postcode area',
      placePhrase: `the ${location.name} postcode area`,
    }
  }
  if (location.tier === 'town') {
    return {
      eyebrow: councilName ? `Town · ${councilName}` : 'Town',
      placePhrase: location.name,
    }
  }
  return { eyebrow: 'Council', placePhrase: location.name }
}

function ApplicationCard({ app, portalUrl }: { app: PublicApplication; portalUrl: string | null }) {
  return (
    <li className="border-t border-[#E5E7EB] py-4 first:border-t-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-semibold text-[#2563EB]">{app.reference}</span>
          {app.application_date && (
            <span className="text-xs text-[#9CA3AF]">{niceDate(app.application_date)}</span>
          )}
        </div>
        {app.status && (
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${statusClasses(app.status)}`}>
            {app.status}
          </span>
        )}
      </div>
      {app.address && <p className="mt-1.5 text-sm font-semibold text-[#111827]">{app.address}</p>}
      {app.description && <p className="mt-1 text-sm leading-relaxed text-[#4B5563]">{app.description}</p>}
      {portalUrl && (
        <a
          href={portalUrl}
          target="_blank"
          rel="nofollow noopener"
          className="mt-2 inline-block text-xs font-medium text-[#2563EB] hover:underline"
        >
          Look up on the council planning portal &rarr;
        </a>
      )}
    </li>
  )
}

function LinkSection({ title, links }: { title: string; links: LinkItem[] }) {
  if (links.length === 0) return null
  return (
    <div>
      <h3 className="text-sm font-semibold text-[#111827]">{title}</h3>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
        {links.map((l) => (
          <li key={l.href}>
            <a href={l.href} className="text-sm text-[#2563EB] hover:underline">
              {l.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}

async function buildLinkSections(
  location: SeoLocation,
): Promise<{ sections: { title: string; links: LinkItem[] }[]; councilName?: string }> {
  const councils = await getLocationsByTier('council')
  const councilName = (slug: string) => councils.find((c) => c.slug === slug)?.name ?? slug
  const sections: { title: string; links: LinkItem[] }[] = []

  if (location.tier === 'council') {
    const [towns, postcodes] = await Promise.all([
      getTownsForCouncil(location.slug),
      getPostcodesForCouncil(location.slug),
    ])
    sections.push({ title: `Towns in ${location.name}`, links: towns.map((t) => ({ href: townHref(location.slug, t.slug), label: t.name })) })
    sections.push({ title: `Postcode areas in ${location.name}`, links: postcodes.map((p) => ({ href: postcodeHref(p.slug), label: p.name })) })
    sections.push({ title: 'Other councils', links: councils.filter((c) => c.slug !== location.slug).map((c) => ({ href: councilHref(c.slug), label: c.name })) })
    return { sections }
  }

  if (location.tier === 'town') {
    const parent = location.parent_slug ?? ''
    const siblings = (await getTownsForCouncil(parent)).filter((t) => t.slug !== location.slug)
    sections.push({ title: `Other towns in ${councilName(parent)}`, links: siblings.map((t) => ({ href: townHref(parent, t.slug), label: t.name })) })
    sections.push({ title: 'Councils', links: councils.map((c) => ({ href: councilHref(c.slug), label: c.name })) })
    return { sections, councilName: councilName(parent) }
  }

  // postcode
  const [coveringCouncils, allPostcodes] = await Promise.all([
    getCouncilsForPostcode(location.slug),
    getLocationsByTier('postcode'),
  ])
  sections.push({ title: 'Councils covering this area', links: coveringCouncils.map((c) => ({ href: councilHref(c.slug), label: c.name })) })
  sections.push({ title: 'Other postcode areas', links: allPostcodes.filter((p) => p.slug !== location.slug).map((p) => ({ href: postcodeHref(p.slug), label: p.name })) })
  return { sections }
}

export default async function LocationPageView({
  location,
  canonicalUrl,
}: {
  location: SeoLocation
  canonicalUrl: string
}) {
  const [apps, portalMap, linkData] = await Promise.all([
    getLocationApplications(location),
    getCouncilPortalMap(),
    buildLinkSections(location),
  ])

  const stats = computeStats(apps)
  const recent = apps.slice(0, 20)
  const { eyebrow, placePhrase } = presentation(location, linkData.councilName)
  const summary = buildSummary(placePhrase, stats)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Planning applications in ${location.name}`,
    url: canonicalUrl,
    numberOfItems: recent.length,
    itemListElement: recent.map((a, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Thing',
        name: `${a.reference}${a.address ? ` — ${a.address}` : ''}`,
        ...(a.description ? { description: a.description } : {}),
      },
    })),
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />

      <p className="text-xs font-semibold uppercase tracking-wider text-[#2563EB]">{eyebrow}</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-[#111827] text-balance">
        Planning applications in {location.name}
      </h1>

      <p className="mt-3 text-[15px] leading-relaxed text-[#4B5563]">{summary}</p>

      <div className="mt-6">
        <AlertForm locationSlug={location.slug} locationType={location.tier} placeName={location.name} />
      </div>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-[#111827]">
          {recent.length === 1 ? 'Most recent application' : `${recent.length} most recent applications`}
        </h2>
        {recent.length > 0 ? (
          <ul className="mt-3">
            {recent.map((a) => (
              <ApplicationCard key={a.id} app={a} portalUrl={portalSearchUrl(portalMap[a.council_slug])} />
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-[#6B7280]">No applications on record for this area yet.</p>
        )}
      </section>

      <nav className="mt-12 space-y-6 border-t border-[#E5E7EB] pt-8" aria-label="Related areas">
        {linkData.sections.map((s) => (
          <LinkSection key={s.title} title={s.title} links={s.links} />
        ))}
      </nav>
    </div>
  )
}
