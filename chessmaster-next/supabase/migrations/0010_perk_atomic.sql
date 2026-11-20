-- P-01 fix: atomic perk purchase. The previous route did read-modify-write on profiles.xp,
-- so two concurrent purchases of DIFFERENT perks could both pass the affordability check and
-- both deduct (last-writer-wins) => overspend. This function serializes purchases by locking
-- the buyer's profile row (FOR UPDATE), then checks ownership + affordability and inserts +
-- deducts in ONE transaction. Concurrent calls queue on the row lock and re-check the reduced
-- balance, so a user can never buy more than they can afford.
--
-- SECURITY DEFINER so it can update under the service-role server path; it only ever touches the
-- p_user passed by the (already authenticated + authorized) server route, never auth.uid()-free
-- client input.
create or replace function public.purchase_perk(p_user uuid, p_perk text, p_cost integer)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_xp integer;
begin
  if p_cost < 0 then return 'invalid'; end if;

  -- Lock the buyer's row; concurrent purchases for the same user serialize here.
  select xp into v_xp from public.profiles where id = p_user for update;
  if not found then return 'no_user'; end if;

  if exists (select 1 from public.user_perks where user_id = p_user and perk_key = p_perk) then
    return 'already_owned';
  end if;

  if v_xp < p_cost then return 'insufficient'; end if;

  insert into public.user_perks (user_id, perk_key, cost) values (p_user, p_perk, p_cost);
  update public.profiles set xp = xp - p_cost where id = p_user;
  return 'ok';
end;
$$;

-- Only the service role (server) may execute this; never exposed to anon/authenticated clients.
revoke all on function public.purchase_perk(uuid, text, integer) from public, anon, authenticated;
