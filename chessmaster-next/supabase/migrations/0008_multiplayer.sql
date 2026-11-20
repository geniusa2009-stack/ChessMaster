-- Online multiplayer: ONE authoritative game row per match. All state (fen/turn/clocks/
-- moves/winner) is mutated only by server routes via the service-role key. Realtime is a
-- refetch signal, never authority.

do $$ begin
  create type public.mp_status as enum ('waiting','active','finished');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.mp_side as enum ('white','black');
exception when duplicate_object then null; end $$;

create table if not exists public.mp_games (
  id             uuid primary key default gen_random_uuid(),
  white_player   uuid references public.profiles(id) on delete set null,
  black_player   uuid references public.profiles(id) on delete set null,
  status         public.mp_status not null default 'waiting',
  turn           public.mp_side not null default 'white',
  fen            text not null default 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  moves          jsonb not null default '[]'::jsonb,          -- server-validated UCI list
  ranked         boolean not null default true,
  time_control   integer,                                     -- base seconds per side, null = no clock
  white_ms       integer,                                     -- remaining ms (null = no clock)
  black_ms       integer,
  last_move_at   timestamptz,                                 -- for authoritative clock deduction
  version        integer not null default 0,                  -- optimistic concurrency
  winner         public.mp_side,                              -- null while active / on draw
  is_draw        boolean not null default false,
  termination    text,                                        -- checkmate|resign|timeout|stalemate|draw|...
  created_at     timestamptz not null default now(),
  started_at     timestamptz,
  finished_at    timestamptz,
  constraint players_distinct check (white_player is null or black_player is null or white_player <> black_player),
  constraint active_has_no_winner check (status <> 'active' or (winner is null and is_draw = false)),
  constraint finished_has_timestamp check (status <> 'finished' or finished_at is not null),
  constraint winner_only_when_finished check (winner is null or status = 'finished')
);
create index if not exists idx_mp_waiting on public.mp_games (status, created_at) where status = 'waiting';
create index if not exists idx_mp_white on public.mp_games (white_player, status);
create index if not exists idx_mp_black on public.mp_games (black_player, status);

alter table public.mp_games enable row level security;

-- Participants may READ their own games; no one else can (prevents id-guess snooping).
drop policy if exists mp_select_participant on public.mp_games;
create policy mp_select_participant on public.mp_games
  for select using (auth.uid() = white_player or auth.uid() = black_player or public.is_admin());
-- No client INSERT/UPDATE/DELETE: every mutation goes through server routes (service role).
