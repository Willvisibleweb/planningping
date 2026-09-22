// Keep the global project-team layer in step with trusted ingestion. Today the
// only source relationship is PlanIt's agent_company; future source adapters
// can pass additional roles through this same narrow boundary.

import type { createAdminClient } from '@/lib/supabase/admin'

type AdminClient = ReturnType<typeof createAdminClient>

export interface AgentOrganisationSource {
  applicationId: string
  agentCompany: string | null
  sourceUrl: string | null
  sourceCheckedAt: string | null
}

function normaliseName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

export async function syncAgentOrganisations(
  supabase: AdminClient,
  sources: AgentOrganisationSource[],
): Promise<void> {
  const usable = sources
    .filter((source) => source.agentCompany && source.agentCompany.trim().toLowerCase() !== 'see source')
    .map((source) => ({ ...source, agentCompany: source.agentCompany!.trim() }))

  if (usable.length === 0) return

  const organisationsByKey = new Map<string, string>()
  for (const source of usable) {
    const key = normaliseName(source.agentCompany)
    if (!organisationsByKey.has(key)) organisationsByKey.set(key, source.agentCompany)
  }

  const organisationRows = [...organisationsByKey.entries()].map(([normalized_name, name]) => ({
    name,
    normalized_name,
    verification_status: 'source_record',
    source_label: 'PlanIt planning record',
  }))

  const { error: organisationError } = await supabase
    .from('organisations')
    .upsert(organisationRows, { onConflict: 'normalized_name', ignoreDuplicates: true })
  if (organisationError) throw new Error(`organisation upsert failed: ${organisationError.message}`)

  const { data: organisations, error: lookupError } = await supabase
    .from('organisations')
    .select('id, normalized_name')
    .in('normalized_name', [...organisationsByKey.keys()])
  if (lookupError) throw new Error(`organisation lookup failed: ${lookupError.message}`)

  const idByKey = new Map(
    ((organisations ?? []) as { id: string; normalized_name: string }[]).map((row) => [row.normalized_name, row.id]),
  )

  const associations = usable.flatMap((source) => {
    const organisationId = idByKey.get(normaliseName(source.agentCompany))
    if (!organisationId) return []
    return [{
      application_id: source.applicationId,
      organisation_id: organisationId,
      role: 'planning_agent',
      source_label: 'PlanIt planning record',
      source_url: source.sourceUrl,
      source_checked_at: source.sourceCheckedAt,
    }]
  })

  if (associations.length === 0) return

  const { error: associationError } = await supabase
    .from('project_organisations')
    .upsert(associations, {
      onConflict: 'application_id,organisation_id,role',
      ignoreDuplicates: true,
    })
  if (associationError) throw new Error(`project organisation upsert failed: ${associationError.message}`)
}
