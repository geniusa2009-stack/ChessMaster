-- Adaptive training engine state. Append-only event log + per-item spaced-repetition state.
-- All writes are server-only (service role) after auth; clients may read only their own rows.

-- Append-only training events (success/fail per attempt). This is the evidence the skill model,
-- mistake memory and scheduler consume — no fabricated history is ever inserted.
create table if not exists public.training_events (
  id         bigserial primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  kind       text not null default 'puzzle' check (kind in ('puzzle')),
  ref_id     integer not null,                         -- puzzle id
  theme      text not null,                            -- e.g. mateIn2 (from validated content)
  difficulty text not null check (difficulty in ('easy','medium','hard','expert')),
  outcome    text not null check (outcome in ('success','fail')),
  created_at timestamptz not null default now()
);
create index if not exists idx_training_events_user on public.training_events(user_id, created_at desc);
create index if not exists idx_training_events_theme on public.training_events(user_id, theme);

-- Spaced-repetition review state per (user, item). SM-2-inspired (documented adaptation).
create table if not exists public.review_state (
  user_id      uuid not null references public.profiles(id) on delete cascade,
  item_kind    text not null default 'puzzle' check (item_kind in ('puzzle')),
  item_id      integer not null,
  interval_days integer not null default 0,
  reps         integer not null default 0,
  ease         integer not null default 250,           -- ease*100 (2.50) to keep it integer
  due_at       timestamptz not null default now(),
  last_outcome text check (last_outcome in ('success','fail')),
  updated_at   timestamptz not null default now(),
  primary key (user_id, item_kind, item_id)
);
create index if not exists idx_review_due on public.review_state(user_id, due_at);

alter table public.training_events enable row level security;
alter table public.review_state    enable row level security;

drop policy if exists te_select_own on public.training_events;
create policy te_select_own on public.training_events
  for select using (auth.uid() = user_id or public.is_admin());
drop policy if exists rs_select_own on public.review_state;
create policy rs_select_own on public.review_state
  for select using (auth.uid() = user_id or public.is_admin());
-- No client writes to either table (server/service-role only).
