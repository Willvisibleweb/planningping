// Pipeline view — the civils CRM. Shows the user's tracked leads as columns by
// pipeline stage. Server-fetched; RLS scopes leads to the current user.
// Professional feature: homeowners and lapsed trials see the gate instead.

import { createClient } from '@/lib/supabase/server'
import { getProfile, isProfessional, hasProAccess } from '@/lib/access'
import PipelineBoard from '@/components/dashboard/PipelineBoard'
import ProGate from '@/components/dashboard/ProGate'
import type { TrackedLead } from '@/types/database'

export default async function PipelinePage() {
  const profile = await getProfile()
  if (!isProfessional(profile)) return <ProGate variant="homeowner" />
  if (!hasProAccess(profile)) return <ProGate variant="expired" />

  const supabase = await createClient()

  // Priority follow-ups first (status changed since tracking), then newest.
  const { data: leads } = await supabase
    .from('tracked_leads')
    .select('*')
    .order('priority_follow_up', { ascending: false })
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-1">Pipeline</h2>
        <p className="text-sm text-gray-500">
          Opportunities you&rsquo;re pursuing, by stage. Generate a tailored outreach draft
          for any opportunity, then mark it sent to log the contact date.
        </p>
      </div>

      <PipelineBoard leads={(leads ?? []) as TrackedLead[]} />
    </div>
  )
}
