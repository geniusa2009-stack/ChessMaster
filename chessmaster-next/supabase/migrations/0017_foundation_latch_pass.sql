-- R7.3.2.2.1: ATOMIC pass-latch write for the CH01 assessment record. The previous path computed
-- score = max(existing, new) in application memory and then upserted — a read-then-write that can LOSE
-- a higher score under concurrent passing attempts. This function performs the maximum inside ONE
-- statement so the row lock serialises concurrent writers:
--     passed := existing.passed OR true
--     score  := GREATEST(existing.score, incoming.score)   (highest score always wins)
-- The caller passes the RAW attempt score; the database decides the maximum.
--
-- SECURITY INVOKER (the default): the function runs with the caller's privileges, so a browser using
-- the anon/authenticated role is still blocked by foundation_assessment's RLS (which has NO client
-- write policy — migrations 0013/0014/0016 add none). Only the server's service-role client (which
-- bypasses RLS) can actually write. `p_user` is supplied by the server AFTER authorization, never by
-- the client. EXECUTE is additionally revoked from the client roles as defence in depth.
create or replace function public.foundation_latch_pass(
  p_user uuid, p_assessment text, p_score integer, p_total integer
) returns void
language sql
as $$
  insert into public.foundation_assessment (user_id, assessment_id, passed, score, total, completed_at)
  values (p_user, p_assessment, true, p_score, p_total, now())
  on conflict (user_id, assessment_id) do update set
    passed       = public.foundation_assessment.passed or excluded.passed,
    score        = greatest(public.foundation_assessment.score, excluded.score),
    completed_at = now();
$$;

revoke execute on function public.foundation_latch_pass(uuid, text, integer, integer) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on function public.foundation_latch_pass(uuid, text, integer, integer) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke execute on function public.foundation_latch_pass(uuid, text, integer, integer) from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.foundation_latch_pass(uuid, text, integer, integer) to service_role';
  end if;
end $$;
