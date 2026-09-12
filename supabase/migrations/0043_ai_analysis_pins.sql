-- Per-user pins on the Research library.
--
-- `ai_analyses` deliberately has no user_id: an analysis is market-, sector- or
-- ticker-scoped, generated once and read by everyone. So "pinned" cannot be a
-- column on it - a boolean there would pin the row for every account. It is a
-- relationship between a user and an analysis, and it gets its own table.
--
-- Deleting an analysis takes its pins with it (cascade). Deleting a user takes
-- theirs. A pin carries no data of its own beyond when it was made, which is
-- what the library sorts pinned entries by.

create table if not exists public.ai_analysis_pins (
  user_id uuid not null references auth.users (id) on delete cascade,
  analysis_id uuid not null references public.ai_analyses (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, analysis_id)
);

comment on table public.ai_analysis_pins is
  'Per-user pins on shared ai_analyses rows. ai_analyses has no user_id, so a pin cannot be a column on it.';

-- The library lists a user's pins newest-first; the composite PK already covers
-- the (user_id, analysis_id) membership test, so this only adds the ordering.
create index if not exists ai_analysis_pins_user_created_idx
  on public.ai_analysis_pins (user_id, created_at desc);

alter table public.ai_analysis_pins enable row level security;

-- A pin is private. Each policy re-states the ownership test rather than
-- relying on a permissive default, so a future policy added here cannot widen
-- read access by accident.
drop policy if exists "own pins are selectable" on public.ai_analysis_pins;
create policy "own pins are selectable"
  on public.ai_analysis_pins
  for select
  using (auth.uid() = user_id);

drop policy if exists "own pins are insertable" on public.ai_analysis_pins;
create policy "own pins are insertable"
  on public.ai_analysis_pins
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "own pins are deletable" on public.ai_analysis_pins;
create policy "own pins are deletable"
  on public.ai_analysis_pins
  for delete
  using (auth.uid() = user_id);

-- No update policy: a pin has no mutable field. Toggling off is a delete.
