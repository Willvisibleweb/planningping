-- =============================================================================
-- Migration: councils.ref_prefixes — the distinctive leading prefixes of a
-- council's planning reference numbers. A council can use several (Staffordshire
-- Moorlands uses SMD/, CON/, DOC/, ...). Run in the Supabase SQL editor.
--
-- The webhook uses these to detect mislabelled batches: if an application's
-- reference prefix belongs to a DIFFERENT council than the batch claims, it is
-- rejected and logged instead of being persisted under the wrong council_slug.
-- Only set it for councils whose refs have a stable ALPHA prefix; leave null for
-- councils with numeric-only refs (e.g. "24/01234/FUL") — those aren't validated
-- by prefix. Extend a council's array as new prefixes appear in real data.
-- =============================================================================

alter table public.councils
  add column if not exists ref_prefixes text[];

update public.councils
set ref_prefixes = array['SMD','CON','DOC']
where slug = 'staffordshire-moorlands';
