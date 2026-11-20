-- R7.3.1: per-item evidence on the append-only foundation_attempt table. Each attempt now records
-- WHICH item/variant (by stable id + contextKey + competency) was answered correctly, so the
-- competency evidence policy (>= minContexts distinct correct contexts) is auditable and so the
-- learner report can explain exactly which contexts still need practice. NO answer keys, NO
-- accepted-move sets, NO raw answer payloads are stored. Smallest safe change: one nullable jsonb
-- column on the existing table (no new table, no schema reshuffle). RLS/ownership inherited from
-- 0014 (read-own; server/service-role writes only).
alter table public.foundation_attempt
  add column if not exists items jsonb not null default '[]'::jsonb;  -- [{id,competency,contextKey,correct}]
comment on column public.foundation_attempt.items is
  'R7.3.1 per-item evidence: [{id,competency,contextKey,correct}] — NO answers / accepted moves stored.';
