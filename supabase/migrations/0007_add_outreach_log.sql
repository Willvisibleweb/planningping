-- 0007: Outreach usage log — rate-limits AI draft generation.
--
-- Every Anthropic call from /api/outreach costs real money, and a trial user
-- could otherwise generate drafts in an unbounded loop. The route counts a
-- user's rows for the current UTC day before calling the model and refuses
-- past the daily cap. Doubles as usage analytics (who actually uses outreach).
--
-- RLS: users can see and insert their own rows only. Deliberately NO update
-- or delete policies — rows are immutable, so a user can't clear their own
-- count to reset the cap.

create table public.outreach_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  lead_id    uuid,
  created_at timestamptz not null default now()
);

alter table public.outreach_log enable row level security;

create policy "outreach_log: select own" on public.outreach_log
  for select using (user_id = auth.uid());

create policy "outreach_log: insert own" on public.outreach_log
  for insert with check (user_id = auth.uid());

-- The rate-limit query is (user_id, created_at >= start-of-day).
create index idx_outreach_log_user_created
  on public.outreach_log (user_id, created_at desc);

-- Rollback:
-- drop table public.outreach_log;
