// Pipeline view — the civils CRM. Shows the user's tracked leads as columns by
// pipeline stage. Server-fetched; RLS scopes leads to the current user.

import { createClient } from '@/lib/supabase/server'
import PipelineBoard from '@/components/dashboard/PipelineBoard'
import type { TrackedLead } from '@/types/database'

export default async function PipelinePage() {
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
          Opportunities you&rsquo;re tracking, by stage. Generate a tailored outreach draft
          for any lead, then mark it sent to log the contact date.
        </p>
      </div>

      <PipelineBoard leads={(leads ?? []) as TrackedLead[]} />
    </div>
  )
}
