-- Decision alerts: tell a user when a tracked application is actually decided.
--
-- The ingest already knows when a status changes — upsertApplications compares
-- stateHash(status, decision_date) against the stored hash — but it throws that
-- away for anything that isn't brand new. This column is what makes acting on
-- it safe.
--
-- Why a column and not just "status looks approved":
--
-- Alerting on the *state* would email every user about every already-decided
-- application the first time this runs. Alerting on the *transition* is
-- correct, but the transition can only be observed if we know the previous
-- status — and for the 2,900+ rows already in the table we never recorded one.
-- On the first run after deploy every row looks like "no previous status",
-- so any council that so much as rewords its status text could fire a burst.
--
-- decision_alerted_at makes the guarantee structural rather than inferred: an
-- application can produce at most one decision alert, ever, regardless of how
-- many times its status is rewritten or the job is re-run.

alter table public.planning_applications
  add column if not exists decision_alerted_at timestamptz;

comment on column public.planning_applications.decision_alerted_at is
  'When a decision alert was sent for this application. Non-null means never alert again — the at-most-once guard for decision alerts.';

-- Backfill: everything already carrying a decision is marked as alerted, so
-- history can never be announced as news. Only decisions that happen from now
-- on will notify. This is the whole point of shipping the column before the
-- feature — running the fan-out first would have emailed years of backlog.
-- Must stay in step with classifyDecision() in lib/classification/decisionOutcome.ts.
-- The bare "Decided"/"Determined" case is included because 20 such rows exist
-- in production with no decision_date — they read as final to the classifier,
-- so without this they would have been announced as fresh news on the first run.
update public.planning_applications
set decision_alerted_at = now()
where decision_alerted_at is null
  and (
    status ~* '(approv|grant|permit|refus|reject|withdraw|dismiss)'
    or status ~* '^(decided|determined)\b'
    or status ~* 'decision (issued|made)'
    or decision_date is not null
  );

-- The fan-out asks "which of these applications still needs an alert", which
-- is a small set against a growing table.
create index if not exists planning_applications_decision_pending_idx
  on public.planning_applications (id)
  where decision_alerted_at is null;
