-- RPG / progression: daily quest claims, perk purchases, achievement catalog.
-- XP itself stays in profiles.xp (single authoritative ledger); no second XP column.

-- Daily quest claims — idempotent per (user, quest, UTC day).
create table if not exists public.quest_claims (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  quest_key  text not null,
  quest_date date not null,                    -- UTC day the quest was claimed for
  xp_awarded integer not null default 0 check (xp_awarded >= 0),
  claimed_at timestamptz not null default now(),
  primary key (user_id, quest_key, quest_date)
);
create index if not exists idx_quest_claims_user on public.quest_claims(user_id, quest_date desc);

-- Perk purchases (XP shop) — idempotent per (user, perk).
create table if not exists public.user_perks (
  user_id   uuid not null references public.profiles(id) on delete cascade,
  perk_key  text not null,
  cost      integer not null check (cost >= 0),
  bought_at timestamptz not null default now(),
  primary key (user_id, perk_key)
);
create index if not exists idx_user_perks_user on public.user_perks(user_id);

alter table public.quest_claims enable row level security;
alter table public.user_perks   enable row level security;

drop policy if exists qc_select_own on public.quest_claims;
create policy qc_select_own on public.quest_claims
  for select using (auth.uid() = user_id or public.is_admin());
drop policy if exists up_select_own on public.user_perks;
create policy up_select_own on public.user_perks
  for select using (auth.uid() = user_id or public.is_admin());
-- No client writes to either table (server/service-role only).

-- Extend the achievement catalog with the ported legacy badges.
insert into public.achievements (key, title, description) values
  ('puzzles_1',  'First Blood',       'Solve your first puzzle.'),
  ('puzzles_3',  'Getting Sharp',     'Solve 3 puzzles.'),
  ('puzzles_10', 'Tactician',         'Solve 10 puzzles.'),
  ('puzzles_25', 'Puzzle Master',     'Solve 25 puzzles.'),
  ('opening_master', 'Theory Student','Master your first opening.')
on conflict (key) do nothing;
