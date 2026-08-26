-- 0030: atomic quota + burst limit for every AI endpoint.
--
-- The routes previously counted a user's rows for the day, compared, then
-- inserted. Those are two statements, so N concurrent requests all read the
-- same count and all pass — the cap was advisory, and 50 parallel calls would
-- have sailed through a limit of 20. There was also no burst limit at all: a
-- day's allowance could be spent in two seconds.
--
-- Both are fixed by moving the decision into one function that takes an
-- advisory lock, checks a per-minute window and a per-UTC-day window, and
-- inserts the log row itself. One round trip, one transaction, no race.
--
-- The slot is reserved BEFORE the model is called, which is the opposite of
-- what the routes did. It has to be: a limit you only apply after the expensive
-- thing has happened is not a limit. The routes delete the reserved row when
-- the call fails, so a failure still costs the user nothing — see the note on
-- deletes below.

create or replace function public.consume_ai_quota(
  p_user_id uuid,
  p_kind text,
  p_lead_id uuid default null
)
returns jsonb
language plpgsql
security definer
-- Pinned so the function cannot be hijacked by a caller-controlled search_path.
set search_path = public, pg_temp
as $$
declare
  v_per_minute int;
  v_per_day    int;
  v_kinds      text[];
  v_minute     int;
  v_day        int;
  v_id         uuid;
begin
  -- Limits live here rather than in a parameter. A caller that can name its
  -- own limit has no limit, and this function's whole job is to be the thing
  -- the caller cannot talk out of a decision.
  -- v_kinds is which rows count towards this limit, which is not always just
  -- p_kind. email and letter are two modes of one feature and shared a single
  -- daily budget before this migration; splitting them here would quietly
  -- double what an outreach user can spend, so they still count together.
  case p_kind
    when 'chat'    then v_per_minute :=  5; v_per_day := 20; v_kinds := array['chat'];
    when 'summary' then v_per_minute := 10; v_per_day := 60; v_kinds := array['summary'];
    when 'email'   then v_per_minute :=  5; v_per_day := 20; v_kinds := array['email', 'letter'];
    when 'letter'  then v_per_minute :=  5; v_per_day := 20; v_kinds := array['email', 'letter'];
    else raise exception 'unknown kind: %', p_kind using errcode = '22023';
  end case;

  -- Serialises concurrent calls for this user+kind for the rest of the
  -- transaction. This is the line that turns the cap from advisory into real.
  -- Keyed on the bucket rather than p_kind so that email and letter, which
  -- share a budget, also share a lock.
  perform pg_advisory_xact_lock(hashtext(p_user_id::text || ':' || v_kinds[1]));

  select count(*) into v_minute
    from public.outreach_log
   where user_id = p_user_id
     and kind = any(v_kinds)
     and created_at > now() - interval '1 minute';

  if v_minute >= v_per_minute then
    return jsonb_build_object('allowed', false, 'reason', 'burst');
  end if;

  -- UTC day, matching the boundary the routes used before.
  select count(*) into v_day
    from public.outreach_log
   where user_id = p_user_id
     and kind = any(v_kinds)
     and created_at >= date_trunc('day', now() at time zone 'utc');

  if v_day >= v_per_day then
    return jsonb_build_object('allowed', false, 'reason', 'daily', 'limit', v_per_day);
  end if;

  -- The row records the actual kind, not the bucket: the ledger stays exact
  -- even where the budget is shared.
  insert into public.outreach_log (user_id, kind, lead_id)
  values (p_user_id, p_kind, p_lead_id)
  returning id into v_id;

  return jsonb_build_object(
    'allowed', true,
    'id', v_id,
    'remaining', v_per_day - v_day - 1
  );
end;
$$;

-- Service role only, and deliberately not granted to `authenticated`.
--
-- The routes call this with the admin client. That is the point: 0007 gave
-- outreach_log no update or delete policy precisely so a user could not clear
-- their own count to reset the cap, and the release-on-failure path would have
-- handed that ability straight back if it were exposed as a user-callable RPC —
-- a user can read their own row ids, so they could have released their
-- successes too. Keeping both the consume and the release server-side means the
-- rows stay immutable to the user, exactly as 0007 intended.
revoke all on function public.consume_ai_quota(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.consume_ai_quota(uuid, text, uuid) to service_role;

comment on function public.consume_ai_quota(uuid, text, uuid) is
  'Atomically checks the per-minute and per-UTC-day limits for one user and one AI feature, and reserves a slot by inserting the log row. Returns {allowed, id, remaining} or {allowed:false, reason}. Limits are hardcoded per kind, and email/letter share one budget — see 0030. Service role only.';

-- The queries now filter on kind, which 0007's (user_id, created_at) index
-- does not cover.
create index if not exists idx_outreach_log_user_kind_created
  on public.outreach_log (user_id, kind, created_at desc);

-- Rollback:
-- drop function if exists public.consume_ai_quota(uuid, text, uuid);
-- drop index if exists public.idx_outreach_log_user_kind_created;
