-- R7.3: append-only per-attempt competency evidence for the CH01 assessment. foundation_assessment
-- (0013) remains the authoritative PASS latch (never downgraded); this table records attempt
-- history + per-competency results for remediation/audit. Server-only writes; RLS read-own.
create table if not exists public.foundation_attempt (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  assessment_id text not null default 'CH01',
  passed       boolean not null default false,
  score        integer not null default 0,
  total        integer not null default 0,
  competencies jsonb not null default '[]'::jsonb,  -- [{competency,status}]; NO answer keys
  created_at   timestamptz not null default now()
);
create index if not exists idx_foundation_attempt_user on public.foundation_attempt(user_id, created_at desc);

alter table public.foundation_attempt enable row level security;
drop policy if exists foundation_attempt_select_own on public.foundation_attempt;
create policy foundation_attempt_select_own on public.foundation_attempt
  for select using (auth.uid() = user_id or public.is_admin());
-- No client INSERT/UPDATE/DELETE policy: attempts are written only by the server (service role).
