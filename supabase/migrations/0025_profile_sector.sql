-- What the customer actually sells.
--
-- Everything in the product currently assumes one buyer: a civils firm chasing
-- drainage, highways, groundworks and structures. That assumption is baked into
-- the scoring engine and into copy across the app, and it is fine as a starting
-- point — but a materials supplier, a general builder and a developer are all
-- looking at the same planning application for different reasons, and none of
-- them wants a score tuned for someone else's business.
--
-- Recorded at signup rather than inferred, because guessing wrong is worse than
-- asking once. Nullable on purpose: every existing account predates the
-- question, and a null means "never asked", not "no sector". Nothing reads this
-- as a requirement — it steers defaults, it does not gate access.
--
-- A CHECK rather than an enum. The list of sectors will change as the market is
-- better understood, and widening a Postgres enum needs a migration every time
-- while a CHECK can be replaced in one statement. Values are snake_case codes,
-- never display strings: the label shown in the UI will be reworded, and copy
-- edits must not orphan stored rows.

alter table public.profiles
  add column if not exists sector text;

alter table public.profiles
  drop constraint if exists profiles_sector_known;

alter table public.profiles
  add constraint profiles_sector_known check (
    sector is null or sector in (
      'materials',
      'subcontractor',
      'general_builder',
      'developer',
      'professional_services',
      'other'
    )
  );

comment on column public.profiles.sector is
  'What the account sells, captured during onboarding. Null means never asked (all accounts created before onboarding existed). Steers defaults and copy; does not gate access. Codes not labels — see 0025.';
