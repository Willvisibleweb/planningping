// One way to turn a source's authority name into our council slug.
//
// There used to be two: the daily ingest looked the name up in councils, while
// the national backfill and the add-territory path slugified it directly. For
// almost every authority those agree. For Bristol they did not — PlanIt calls
// it "Bristol", our row is 'bristol-city-of', and slugifying produced a second
// row, 'bristol'. Any application written through the slugifying paths would
// have been stored twice, once under each slug, as two separate leads.
//
// Every ingest path now resolves through here, which honours
// councils.canonical_slug (0036) so an alias row redirects to the real one.
// Works before 0036 is applied too: the column is simply not there to read.

import type { createAdminClient } from '@/lib/supabase/admin'
import { slugifyAuthority } from '@/lib/planit'

type AdminClient = ReturnType<typeof createAdminClient>

interface CouncilRow {
  slug: string
  name: string
  canonical_slug?: string | null
}

export interface CouncilResolver {
  /** Our slug for a source authority name, provisioning a councils row if it is new. */
  resolve(authorityName: string): Promise<string>
  /** The canonical slug for any slug (itself unless it is an alias). */
  canonical(slug: string): string
  nameOf(slug: string): string | null
  /** Whether a source authority name already maps to a council row. */
  knows(authorityName: string): boolean
  /** Slugs created during this resolver's lifetime. */
  readonly provisioned: string[]
}

async function loadCouncils(db: AdminClient): Promise<CouncilRow[]> {
  const withAliases = await db.from('councils').select('slug, name, canonical_slug')
  if (!withAliases.error) return (withAliases.data ?? []) as CouncilRow[]
  const basic = await db.from('councils').select('slug, name')
  return (basic.data ?? []) as CouncilRow[]
}

export async function createCouncilResolver(db: AdminClient): Promise<CouncilResolver> {
  const rows = await loadCouncils(db)
  const aliasOf = new Map<string, string>()
  const nameBySlug = new Map<string, string>()
  const slugByName = new Map<string, string>()
  const provisioned: string[] = []

  for (const row of rows) {
    nameBySlug.set(row.slug, row.name)
    if (row.canonical_slug && row.canonical_slug !== row.slug) aliasOf.set(row.slug, row.canonical_slug)
  }
  const canonical = (slug: string): string => aliasOf.get(slug) ?? slug

  // Canonical rows claim their name first, so an alias never wins the lookup.
  for (const row of [...rows].sort((a, b) => Number(Boolean(a.canonical_slug)) - Number(Boolean(b.canonical_slug)))) {
    const key = row.name.trim().toLowerCase()
    if (!slugByName.has(key)) slugByName.set(key, canonical(row.slug))
  }

  return {
    provisioned,
    canonical,
    nameOf: (slug) => nameBySlug.get(canonical(slug)) ?? nameBySlug.get(slug) ?? null,
    knows: (authorityName) => slugByName.has(authorityName.trim().toLowerCase()),
    async resolve(authorityName: string): Promise<string> {
      const key = authorityName.trim().toLowerCase()
      const known = slugByName.get(key)
      if (known) return known

      const slug = canonical(slugifyAuthority(authorityName))
      if (!nameBySlug.has(slug)) {
        await db
          .from('councils')
          .upsert({ slug, name: authorityName.trim(), supported: true }, { onConflict: 'slug', ignoreDuplicates: true })
        nameBySlug.set(slug, authorityName.trim())
        provisioned.push(slug)
      }
      slugByName.set(key, slug)
      return slug
    },
  }
}
