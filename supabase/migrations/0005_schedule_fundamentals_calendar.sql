-- Schedules the two Phase 2 extension functions via pg_cron + pg_net.
--
-- Deploy both with --no-verify-jwt first (see supabase/README.md):
--   supabase functions deploy ingest-fundamentals --no-verify-jwt
--   supabase functions deploy ingest-calendar --no-verify-jwt
--
-- Before running this file: replace <project-ref> below.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Fundamentals move only when a company files, so weekly is plenty and keeps
-- us well inside SEC's fair-access rate guidance.
select cron.schedule(
  'ingest-fundamentals-weekly',
  '0 6 * * 1',
  $$
  select net.http_post(
    url := 'https://<project-ref>.functions.supabase.co/ingest-fundamentals',
    headers := jsonb_build_object('Content-Type', 'application/json')
  );
  $$
);

-- The calendar is a rolling 21-day forward window, so refresh daily.
select cron.schedule(
  'ingest-calendar-daily',
  '30 6 * * *',
  $$
  select net.http_post(
    url := 'https://<project-ref>.functions.supabase.co/ingest-calendar',
    headers := jsonb_build_object('Content-Type', 'application/json')
  );
  $$
);
