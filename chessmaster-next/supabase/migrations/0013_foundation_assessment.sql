-- R7.2: CH01 foundations (rules) assessment completion. Puzzle_solves and opening_progress cannot
-- represent a rules assessment (no puzzle id, no opening id), so a minimal dedicated record is used.
-- Server-authoritative: written only by the service role after server-side grading. One row per
-- user per assessment (idempotent — no duplicate rewards). RLS: a user reads only their own row.
create table if not exists public.foundation_assessment (
  user_id       uuid not null references public.profiles(id) on delete cascade,
  assessment_id text not null default 'CH01',
  passed        boolean not null default false,
  score         integer not null default 0,
  total         integer not null default 0,
  completed_at  timestamptz not null default now(),
  primary key (user_id, assessment_id)
);
create index if not exists idx_foundation_assessment_user on public.foundation_assessment(user_id);

alter table public.foundation_assessment enable row level security;

drop policy if exists foundation_select_own on public.foundation_assessment;
create policy foundation_select_own on public.foundation_assessment
  for select using (auth.uid() = user_id or public.is_admin());
-- No INSERT/UPDATE/DELETE policy: writes occur only via the server (service role), never the client.
