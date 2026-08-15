-- Cross-user isolation test for the pipeline tables (migration 0022).
--
-- Run against any environment:
--   psql "$DATABASE_URL" -f supabase/tests/rls_pipeline_isolation.sql
-- Exits non-zero and prints FAIL if any row of one user's data is readable by
-- another. Safe to run against production — it reads only, and rolls back.
--
-- Why the role switch matters, and why a weaker test is worthless:
--
-- RLS is enforced for the `authenticated` role. The service role — which is
-- what a Supabase admin client, the SQL editor and most tooling connect as —
-- bypasses RLS entirely by design. A test that sets request.jwt.claims WITHOUT
-- also switching role reads every row in the table and will report a leak that
-- cannot happen. (That is exactly what the first draft of this test did.)
--
-- Setting the claim alone proves nothing. The role switch is the test.

begin;

do $$
declare
  owner_id uuid;
  other_id uuid;
  leaked_leads  int;
  leaked_events int;
  leaked_stages int;
  own_leads     int;
  own_stages    int;
begin
  select user_id into owner_id
    from public.tracked_leads group by user_id order by count(*) desc limit 1;
  select id into other_id from auth.users where id <> owner_id limit 1;

  if owner_id is null then
    raise notice 'SKIP: no leads in this environment, nothing to isolate';
    return;
  end if;
  if other_id is null then
    raise exception 'SKIP: need a second user to test isolation against';
  end if;

  -- Control: under RLS, the owner can still see their own rows. Without this,
  -- a policy that denies everyone would pass the isolation half and look fine.
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', owner_id, 'role', 'authenticated')::text, true);
  select count(*) into own_leads  from public.tracked_leads;
  select count(*) into own_stages from public.pipeline_stages;
  reset role;

  if own_leads = 0 or own_stages = 0 then
    raise exception 'FAIL: owner cannot read their own rows (leads=%, stages=%) — policy too strict',
      own_leads, own_stages;
  end if;

  -- The actual test.
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', other_id, 'role', 'authenticated')::text, true);
  select count(*) into leaked_leads  from public.tracked_leads   where user_id = owner_id;
  select count(*) into leaked_events from public.lead_events     where user_id = owner_id;
  select count(*) into leaked_stages from public.pipeline_stages where user_id = owner_id;
  reset role;

  if leaked_leads > 0 or leaked_events > 0 or leaked_stages > 0 then
    raise exception 'FAIL: cross-user leak — leads=%, events=%, stages=%',
      leaked_leads, leaked_events, leaked_stages;
  end if;

  raise notice 'PASS: owner reads % leads / % stages; other user reads 0 leads, 0 events, 0 stages',
    own_leads, own_stages;
end $$;

-- lead_events must be append-only. A timeline that can be rewritten after the
-- fact is not a record of work done, so there is deliberately no update or
-- delete policy — this asserts nobody adds one later without thinking.
do $$
declare bad int;
begin
  select count(*) into bad from pg_policies
   where schemaname = 'public' and tablename = 'lead_events'
     and cmd in ('UPDATE', 'DELETE');
  if bad > 0 then
    raise exception 'FAIL: lead_events has % update/delete policies — it is meant to be append-only', bad;
  end if;
  raise notice 'PASS: lead_events remains append-only';
end $$;

rollback;
