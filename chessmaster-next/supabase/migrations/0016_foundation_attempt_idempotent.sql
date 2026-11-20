-- R7.3.2: bind each recorded attempt to a server-issued attempt id and make submission IDEMPOTENT at
-- the DATABASE level. The submit route issues a signed token carrying a unique `attempt_id`; recording
-- that attempt upserts on (user_id, attempt_id), so a replayed or concurrently-duplicated submission of
-- the SAME attempt can never create a second evidence row or double-count a competency's contexts.
--
-- Safe/minimal: one nullable column + one unique index (no new table, no policy change). NULLs are
-- distinct in a Postgres unique index, so pre-R7.3.2 rows (attempt_id IS NULL) are unaffected and may
-- coexist; only real attempt ids are deduplicated. RLS/ownership inherited from 0014.
alter table public.foundation_attempt
  add column if not exists attempt_id uuid;  -- server-issued attempt id (from the signed attempt token)
create unique index if not exists uniq_foundation_attempt_user_attempt
  on public.foundation_attempt(user_id, attempt_id);
comment on column public.foundation_attempt.attempt_id is
  'R7.3.2 server-issued attempt id; unique per user for DB-level idempotency. NULL for legacy rows.';
