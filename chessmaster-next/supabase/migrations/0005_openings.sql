-- Openings trainer: authoritative completion/mastery records. Opening lines are public
-- chess theory (served to the client for teaching); rewards/mastery are server-derived.

create table if not exists public.opening_progress (
  user_id      uuid not null references public.profiles(id) on delete cascade,
  opening_id   text not null,
  completed_at timestamptz not null default now(),
  mastered     boolean not null default false,
  xp_awarded   integer not null default 0,
  primary key (user_id, opening_id)          -- one progress row per opening per user
);
create index if not exists idx_opening_progress_user on public.opening_progress(user_id);

alter table public.opening_progress enable row level security;

-- Users read their own progress; writes are server-only (service role).
drop policy if exists opprog_select_own on public.opening_progress;
create policy opprog_select_own on public.opening_progress
  for select using (auth.uid() = user_id or public.is_admin());
