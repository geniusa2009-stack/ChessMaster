-- ChessMaster — schema (authoritative state lives here, never in the browser)
-- Run in the Supabase SQL editor or via `supabase db push`.

create extension if not exists pgcrypto;

-- ---------- roles ----------
do $$ begin
  create type public.user_role as enum ('user','moderator','admin','super_admin');
exception when duplicate_object then null; end $$;

-- ---------- profiles (1:1 with auth.users) ----------
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  username     text unique not null check (char_length(username) between 3 and 24),
  email        text,
  role         public.user_role not null default 'user',
  xp           integer not null default 0 check (xp >= 0),
  rating       integer not null default 800 check (rating between 100 and 4000),
  wins         integer not null default 0 check (wins >= 0),
  losses       integer not null default 0 check (losses >= 0),
  draws        integer not null default 0 check (draws >= 0),
  avatar_url   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------- games / results ----------
create table if not exists public.game_results (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  client_game_id text not null,
  opponent_id    text not null,
  opponent_elo   integer not null check (opponent_elo between 100 and 4000),
  result         text not null check (result in ('win','loss','draw')),
  ranked         boolean not null default false,
  moves          integer not null check (moves >= 0 and moves <= 600),
  duration_ms    integer not null check (duration_ms >= 0),
  pgn            text,
  xp_delta       integer not null default 0,
  rating_delta   integer not null default 0,
  created_at     timestamptz not null default now(),
  unique (user_id, client_game_id)
);
create index if not exists idx_game_results_user on public.game_results(user_id, created_at desc);

-- ---------- achievements ----------
create table if not exists public.achievements (
  key         text primary key,
  title       text not null,
  description text
);
create table if not exists public.user_achievements (
  user_id        uuid not null references public.profiles(id) on delete cascade,
  achievement_key text not null references public.achievements(key) on delete cascade,
  earned_at      timestamptz not null default now(),
  primary key (user_id, achievement_key)
);

-- ---------- certificates (authoritative issuance record) ----------
do $$ begin
  create type public.cert_tier as enum ('bronze','silver','gold');
exception when duplicate_object then null; end $$;

create table if not exists public.certificates (
  id            uuid primary key default gen_random_uuid(),
  serial        text unique not null default encode(gen_random_bytes(9),'hex'), -- public, non-enumerable id
  user_id       uuid not null references public.profiles(id) on delete cascade,
  recipient_name text not null,
  tier          public.cert_tier not null,
  title         text not null,
  status        text not null default 'valid' check (status in ('valid','revoked')),
  issued_at     timestamptz not null default now(),
  metadata      jsonb not null default '{}'::jsonb,
  unique (user_id, tier)
);
create index if not exists idx_certificates_user on public.certificates(user_id);

-- ---------- audit log ----------
create table if not exists public.audit_logs (
  id         bigserial primary key,
  actor_id   uuid references public.profiles(id) on delete set null,
  action     text not null,
  target     text,
  detail     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_created on public.audit_logs(created_at desc);

-- ---------- leaderboard (read-only public projection) ----------
create or replace view public.leaderboard as
  select id as user_id, username, avatar_url, rating, xp, wins, losses, draws
  from public.profiles
  order by rating desc, xp desc
  limit 100;

-- ---------- updated_at trigger ----------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
drop trigger if exists trg_profiles_touch on public.profiles;
create trigger trg_profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------- create profile on signup ----------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email,'@',1) || '_' || substr(new.id::text,1,4)),
    new.email
  ) on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
