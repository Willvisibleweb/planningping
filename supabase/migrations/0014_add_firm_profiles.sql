-- 0014: Firm letterhead identity (for the new formal-letter outreach mode)
-- plus a private storage bucket for an optional logo.
--
-- firm_profiles is deliberately its own table, not new columns on profiles —
-- migration 0006 locked profiles down (revoke update ... from authenticated,
-- only digest_day is user-writable). firm_profiles has normal per-user RLS
-- instead, same shape as tracked_leads (0002).
--
-- logo_path is a private storage object path, never a public URL — the
-- session-scoped client can read it via RLS just fine, no signed URLs or
-- admin-client escalation needed anywhere in the letter-generation flow.
--
-- outreach_log.kind lets that table keep working as usage analytics (0007's
-- own stated intent) now that there are two kinds of generation, not one.
--
-- Rollback:
--   alter table public.outreach_log drop column if exists kind;
--   delete from storage.objects where bucket_id = 'firm-logos';
--   delete from storage.buckets where id = 'firm-logos';
--   drop table if exists public.firm_profiles;

create table public.firm_profiles (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade unique,
  business_name  text,
  address        text,   -- free multi-line letterhead address, split on \n at render time
  phone          text,
  contact_email  text,   -- override; null = fall back to profiles.email at render time
  logo_path      text,   -- private storage object path — NEVER a public URL
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.firm_profiles enable row level security;

create policy "firm_profiles: select own" on public.firm_profiles
  for select using (user_id = auth.uid());
create policy "firm_profiles: insert own" on public.firm_profiles
  for insert with check (user_id = auth.uid());
create policy "firm_profiles: update own" on public.firm_profiles
  for update using (user_id = auth.uid());
create policy "firm_profiles: delete own" on public.firm_profiles
  for delete using (user_id = auth.uid());

-- Reuses the existing trigger fn already used by tracked_leads (schema.sql).
create trigger firm_profiles_updated_at
  before update on public.firm_profiles
  for each row execute function public.set_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('firm-logos', 'firm-logos', false, 1048576, array['image/png', 'image/jpeg'])
on conflict (id) do nothing;

create policy "firm-logos: select own" on storage.objects for select
  using (bucket_id = 'firm-logos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "firm-logos: insert own" on storage.objects for insert
  with check (bucket_id = 'firm-logos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "firm-logos: update own" on storage.objects for update
  using (bucket_id = 'firm-logos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "firm-logos: delete own" on storage.objects for delete
  using (bucket_id = 'firm-logos' and (storage.foldername(name))[1] = auth.uid()::text);

alter table public.outreach_log
  add column if not exists kind text not null default 'email' check (kind in ('email', 'letter'));
