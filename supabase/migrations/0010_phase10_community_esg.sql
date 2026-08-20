-- Phase 10: community, comparison & ESG tools.
--
-- discussion_threads and esg_scores were designed ahead of schedule in
-- schema.sql (see "PHASE 10: discussion, ESG") but never migrated into a
-- live database - this file actually creates them, matching schema.sql's
-- column set and RLS exactly, plus discussion_votes (not in schema.sql,
-- needed for per-user vote tracking) and fundamentals.sector/sic (for the
-- Sector Heat Map).
--
-- No companion schedule_* migration this phase: sector data rides the
-- existing Phase 2 fundamentals cron (0005), ESG is a one-time static seed
-- (supabase/seed/esg.sql), and discussion threads have no ingestion at all.

create table if not exists discussion_threads (
  id uuid primary key default gen_random_uuid(),
  symbol text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  parent_id uuid references discussion_threads(id),
  body text not null,
  upvotes int not null default 0,
  downvotes int not null default 0,
  flagged boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists discussion_threads_symbol_idx on discussion_threads (symbol, created_at desc);

create table if not exists esg_scores (
  id uuid primary key default gen_random_uuid(),
  symbol text not null,
  environmental numeric,
  social numeric,
  governance numeric,
  total numeric,
  source text not null,
  as_of_date date not null,
  unique (symbol, source, as_of_date)
);

-- Per-user vote ledger. discussion_threads.upvotes/downvotes stay plain
-- counters, recomputed from this table by the voteThread server action
-- (src/lib/actions/discussion.ts) on every vote - not a trigger, matching
-- this codebase's preference for action-side mutation logic over DB
-- triggers (the one existing trigger, handle_new_user, exists only because
-- Supabase Auth signup has no server-action hook to run instead).
create table if not exists discussion_votes (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references discussion_threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  direction smallint not null check (direction in (-1, 1)),
  created_at timestamptz not null default now(),
  unique (thread_id, user_id)
);
create index if not exists discussion_votes_thread_idx on discussion_votes (thread_id);

-- Sector classification for the Sector Heat Map, sourced from SEC's company
-- submissions endpoint (sicDescription) in the same ingest-fundamentals run
-- that already resolves CIK per symbol.
alter table fundamentals add column if not exists sector text;
alter table fundamentals add column if not exists sic text;

alter table discussion_threads enable row level security;
alter table discussion_votes enable row level security;
alter table esg_scores enable row level security;

drop policy if exists "read all" on discussion_threads;
drop policy if exists "write own" on discussion_threads;
drop policy if exists "update own" on discussion_threads;
create policy "read all" on discussion_threads for select using (true);
create policy "write own" on discussion_threads for insert with check (auth.uid() = user_id);
create policy "update own" on discussion_threads for update using (auth.uid() = user_id);

drop policy if exists "own votes" on discussion_votes;
create policy "own votes" on discussion_votes for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "public read" on esg_scores;
create policy "public read" on esg_scores for select using (true);
