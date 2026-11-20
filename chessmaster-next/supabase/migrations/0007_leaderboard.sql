-- Leaderboard performance: indexes for DB-side ranking/pagination. No new tables or
-- columns — ranking is DERIVED from the authoritative profiles table (single source of
-- truth). The 0001 `leaderboard` view remains; the app reads via the server route which
-- selects only public columns.
create index if not exists idx_profiles_rating on public.profiles (rating desc, xp desc);
create index if not exists idx_profiles_xp     on public.profiles (xp desc, rating desc);
create index if not exists idx_profiles_wins   on public.profiles (wins desc, rating desc);
