import type { BlogPost } from '@/lib/blog/types'

const post: BlogPost = {
  slug: 'spotting-civils-leads-in-planning-applications',
  title: 'How to spot which planning applications are worth pursuing as civils leads',
  excerpt:
    'Most applications on a council register are noise for a civil engineering firm. Here’s what actually signals real subcontract scope, and what to ignore.',
  date: '2026-08-05',
  content: `Every week, UK planning authorities publish hundreds of new applications. If you're a civil engineering firm doing business development, the temptation is to treat every one of them as a potential lead. In practice, the vast majority aren't — and treating them all the same is the fastest way to waste a business development team's time.

Here's what we've learned building a tool that scores applications specifically for civils relevance, and what actually separates a genuine opportunity from noise.

## Ignore the householder noise first

The single biggest category of applications on any council register is minor householder work: single-storey extensions, loft conversions, porches, garage conversions, fences, conservatories. These make up a huge share of total volume, and almost none of them carry meaningful civils scope. There's no drainage redesign, no earthworks, no structural engagement worth pursuing commercially.

The fastest filter you can apply is simply excluding this category outright. It won't catch everything — a large rear extension with a basement dig is a real exception — but as a first pass, it clears the bulk of the noise with almost no false negatives.

## Look for the words that actually signal scope

Once the obvious noise is filtered, the application *description* is doing most of the work. A handful of keyword groups reliably correlate with real civils subcontract opportunity:

- **Drainage and SuDS** — "drainage", "sustainable drainage", "attenuation", "soakaway", "swale", "surface water", "foul water". These almost always mean someone needs a drainage designer, and often a contractor to install it.
- **Earthworks and groundworks** — "groundworks", "excavation", "cut and fill", "piling", "foundations", "remediation", "contaminated land". Any of these on a site of meaningful size is a genuine lead.
- **Highways and access** — "highway", "S278", "S38", "access road", "junction", "carriageway". Highways works usually mean a formal agreement with the local authority, which is exactly the kind of technical process a civils firm gets pulled into early.
- **Structural and retaining** — "retaining wall", "basement", "underpinning", "sheet pile". Structural civils scope, often overlooked because it reads as a building-control matter rather than a civils one.
- **Flood and water management** — "flood risk", "flood mitigation", "culvert", "watercourse". Increasingly common as flood risk assessments get stricter, and a specialist area many firms actively want more of.

None of these guarantee a project is winnable — but their *absence*, combined with the presence of householder-extension language, is a strong signal to move on.

## Scheme size matters more than application type

A second, independent signal worth tracking: does the description mention a dwelling count or a site area? "Erection of 120 dwellings" or "2.4 hectare site" tells you far more about the realistic civils budget than the formal application category does. A modest single-dwelling application with drainage keywords is a real but small lead; a 50-unit residential scheme is a different order of opportunity even before you know the specifics.

Reference suffixes can help too — an application ending \`/OUT\` (outline) often signals a larger strategic site still working through the earliest stages of design, which is exactly when a civils firm wants to be in the conversation, before scope gets locked in with someone else.

## Why this matters for how you spend your week

None of this is about certainty — automated scoring from a public description is always a starting point, not a verdict. The point is triage: a business development team that reviews 200 applications a week and can't tell which 15 are worth a phone call will spend most of its time on the wrong 185. The keyword and scale signals above won't replace judgement, but they'll get you to the right shortlist faster than reading every application in full.

If you're doing this manually today — scanning council portals, copying references into a spreadsheet, guessing at scope from a one-line description — that's the exact workflow PlanningPing was built to remove. We apply this same scoring automatically across every council you track, and flag the applications that actually look like drainage, groundworks, highways, structural or flood-risk opportunities, so your team's first look is already a shortlist rather than a raw feed.`,
}

export default post
