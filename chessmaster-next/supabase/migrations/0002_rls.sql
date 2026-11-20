-- Row Level Security — the browser gets the anon key, so RLS is the real gate.
-- Clients may READ their data (+ public leaderboard); clients may NOT write any
-- authoritative field. Privileged writes go through server code using the service-role
-- key (which bypasses RLS) AFTER server-side authorization.

alter table public.profiles          enable row level security;
alter table public.game_results      enable row level security;
alter table public.achievements      enable row level security;
alter table public.user_achievements enable row level security;
alter table public.certificates      enable row level security;
alter table public.audit_logs        enable row level security;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin','super_admin')
  );
$$;

-- profiles: read own (or admin); public info is exposed via the leaderboard view.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (auth.uid() = id or public.is_admin());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Block client-side changes to authoritative/privileged columns. Service-role passes.
create or replace function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (current_setting('request.jwt.claim.role', true) = 'service_role')
     or (auth.role() = 'service_role') then
    return new;
  end if;
  if new.role   is distinct from old.role
     or new.xp     is distinct from old.xp
     or new.rating is distinct from old.rating
     or new.wins   is distinct from old.wins
     or new.losses is distinct from old.losses
     or new.draws  is distinct from old.draws then
    raise exception 'Not allowed to modify authoritative fields';
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_profile on public.profiles;
create trigger trg_guard_profile before update on public.profiles
  for each row execute function public.guard_profile_update();

-- game_results: read own; no client writes.
drop policy if exists gr_select_own on public.game_results;
create policy gr_select_own on public.game_results
  for select using (auth.uid() = user_id or public.is_admin());

-- achievements catalog: public-readable.
drop policy if exists ach_select_all on public.achievements;
create policy ach_select_all on public.achievements for select using (true);

drop policy if exists uach_select_own on public.user_achievements;
create policy uach_select_own on public.user_achievements
  for select using (auth.uid() = user_id or public.is_admin());

-- certificates: owner reads own; public verification is server-side by serial (service role).
drop policy if exists cert_select_own on public.certificates;
create policy cert_select_own on public.certificates
  for select using (auth.uid() = user_id or public.is_admin());

-- audit_logs: admin read only; no client writes.
drop policy if exists audit_admin_read on public.audit_logs;
create policy audit_admin_read on public.audit_logs
  for select using (public.is_admin());
