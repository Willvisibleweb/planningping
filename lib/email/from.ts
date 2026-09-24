// Who our email comes from.
//
// One place, because it was copied into four files and they have to agree —
// Resend rejects a send from a domain it has not verified, so a half-finished
// change means some emails stop going out and others carry on.
//
// Set EMAIL_FROM once the sending domain is verified in Resend. Until then the
// default keeps working, so the switch is a config change that can be made and
// reversed without a deploy, rather than a code change that either works or
// silently drops every alert.
//
// Moving to planningping.com matters for more than tidiness: planning alerts
// arriving from an unrelated domain look less trustworthy to the person
// reading them and to the spam filter deciding whether they see it at all.

const DEFAULT_FROM = 'PlanningPing <notifications@kelwave.co.uk>'

export function emailFrom(): string {
  const configured = process.env.EMAIL_FROM?.trim()
  return configured && configured.length > 0 ? configured : DEFAULT_FROM
}
