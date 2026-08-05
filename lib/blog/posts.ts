// Blog post registry. To add a new post: create a file in content/blog/,
// import it here, and add it to ALL_POSTS. No CMS, no frontmatter parser —
// mirrors the markdown-as-a-TS-constant convention already used by
// app/privacy/content.ts and app/terms/content.ts.

import type { BlogPost } from './types'
import spottingCivilsLeads from '@/content/blog/spotting-civils-leads-in-planning-applications'

const ALL_POSTS: BlogPost[] = [spottingCivilsLeads]

export function getAllPosts(): BlogPost[] {
  return [...ALL_POSTS].sort((a, b) => b.date.localeCompare(a.date))
}

export function getPostBySlug(slug: string): BlogPost | undefined {
  return ALL_POSTS.find((p) => p.slug === slug)
}
