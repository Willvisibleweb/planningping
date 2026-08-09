-- Login attempt log, for rate limiting.
--
-- Supabase's own limit on the token endpoint is 1800 requests per hour per IP
-- — 30 password guesses a minute — which is generous enough that it offers no
-- meaningful protection against someone working through a password list for a
-- known email address. This table is what makes a real lockout possible.
--
-- Two axes are recorded because they defend against different things:
--   identifier (the email) — someone guessing one account's password, however
--                            many machines they spread it across.
--   ip                     — someone spraying one common password across many
--                            accounts from one machine.
--
-- Deliberately no RLS policies and no grants to anon/authenticated. Only the
-- service-role client touches this, from server actions. A logged-out visitor
-- must not be able to read it (it would leak which addresses are registered)
-- or write to it (they could manufacture a lockout for someone else's email).

create table if not exists public.auth_attempts (
  id          bigserial primary key,
  identifier  text        not null,
  ip          text,
  succeeded   boolean     not null default false,
  created_at  timestamptz not null default now()
);

comment on table public.auth_attempts is
  'Login attempts, for rate limiting. Service-role only — never expose to anon or authenticated, it would leak which email addresses are registered.';

-- The limiter asks "how many failures for this email/IP since <timestamp>",
-- so both indexes are on (key, created_at) with the newest first.
create index if not exists auth_attempts_identifier_idx
  on public.auth_attempts (identifier, created_at desc);
create index if not exists auth_attempts_ip_idx
  on public.auth_attempts (ip, created_at desc);

alter table public.auth_attempts enable row level security;
-- No policies at all: RLS on with zero policies denies everything to anon and
-- authenticated, while the service role bypasses RLS entirely. That is exactly
-- the access we want, and stating it here means nobody has to infer it.

revoke all on public.auth_attempts from anon, authenticated;
