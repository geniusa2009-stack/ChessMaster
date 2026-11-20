-- Puzzles: authoritative solve records + puzzle rating/streak. Solutions are NOT
-- stored client-side; validation & rewards happen in the Next.js server layer.

alter table public.profiles
  add column if not exists puzzle_rating     integer not null default 1200 check (puzzle_rating between 0 and 4000),
  add column if not exists puzzle_streak     integer not null default 0 check (puzzle_streak >= 0),
  add column if not exists best_puzzle_streak integer not null default 0 check (best_puzzle_streak >= 0);

create table if not exists public.puzzle_solves (
  user_id   uuid not null references public.profiles(id) on delete cascade,
  puzzle_id integer not null,
  xp_awarded integer not null default 0,
  solved_at timestamptz not null default now(),
  primary key (user_id, puzzle_id)          -- idempotency: one reward per puzzle per user
);
create index if not exists idx_puzzle_solves_user on public.puzzle_solves(user_id, solved_at desc);

alter table public.puzzle_solves enable row level security;

-- Users may READ their own solves; writes are server-only (service role).
drop policy if exists psolve_select_own on public.puzzle_solves;
create policy psolve_select_own on public.puzzle_solves
  for select using (auth.uid() = user_id or public.is_admin());

-- The guard_profile_update() trigger from 0002 already blocks client edits to xp;
-- extend the immutability guard to the puzzle columns too.
create or replace function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (current_setting('request.jwt.claim.role', true) = 'service_role')
     or (auth.role() = 'service_role') then
    return new;
  end if;
  if new.role is distinct from old.role
     or new.xp is distinct from old.xp
     or new.rating is distinct from old.rating
     or new.wins is distinct from old.wins
     or new.losses is distinct from old.losses
     or new.draws is distinct from old.draws
     or new.puzzle_rating is distinct from old.puzzle_rating
     or new.puzzle_streak is distinct from old.puzzle_streak
     or new.best_puzzle_streak is distinct from old.best_puzzle_streak then
    raise exception 'Not allowed to modify authoritative fields';
  end if;
  return new;
end $$;
