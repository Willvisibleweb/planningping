-- Let outreach_log count the two new AI features.
--
-- kind was constrained to ('email','letter') when the table only backed draft
-- generation. The territory chat and the per-application summariser are also
-- billed Anthropic calls and need the same daily cap, so they are counted here
-- rather than in a new table — one place where every AI call a user makes is
-- recorded, which is what makes "how much is this costing" answerable.
--
-- Caps stay independent per kind: the routes count rows matching their own
-- kind, so chatting does not eat the allowance for drafting a letter. Sharing
-- the table is about having one ledger, not one budget.
--
-- The table's name is now slightly wrong — it records AI usage generally, not
-- just outreach. Renaming it would touch the outreach route, the pipeline
-- migration that reads it, and the analytics that count it, for no behavioural
-- gain, so the name stays and this comment carries the caveat.

alter table public.outreach_log
  drop constraint if exists outreach_log_kind_check;

alter table public.outreach_log
  add constraint outreach_log_kind_check
  check (kind in ('email', 'letter', 'chat', 'summary'));

comment on column public.outreach_log.kind is
  'Which AI feature produced this call: email/letter (outreach drafts), chat (territory assistant), summary (application summariser). Each is capped independently per UTC day — see 0029.';
