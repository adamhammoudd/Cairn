-- Phase 11: planning tools - goal/target tracking storage.
--
-- Position sizing and scenario modeling are pure client-side math over data
-- already in holdings/historical_prices, so they need no new tables. Goal
-- tracking is the one calculator with state to persist across sessions.

create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  target_value numeric not null,
  target_date date not null,
  created_at timestamptz not null default now()
);
create index if not exists goals_user_idx on goals (user_id, created_at desc);

alter table goals enable row level security;

drop policy if exists "own goals" on goals;
create policy "own goals" on goals for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
