// Who may see internal reliability data.
//
// An allowlist in an environment variable rather than a database flag: it is
// read only on the server, cannot be changed by any request a user can make,
// and needs no migration. A profile column would have to be kept out of the
// user-updatable columns forever; an env var cannot be granted by mistake.
//
//   ADMIN_EMAILS=you@example.com,colleague@example.com

import type { Profile } from '@/types/database'

export function adminEmails(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  )
}

export function isAdmin(profile: Pick<Profile, 'email'> | null): boolean {
  if (!profile?.email) return false
  return adminEmails().has(profile.email.trim().toLowerCase())
}
