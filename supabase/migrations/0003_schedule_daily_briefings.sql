-- Schedules generate-daily-briefings via pg_cron + pg_net.
--
-- Deploy the function with --no-verify-jwt first (see supabase/README.md):
--   supabase functions deploy generate-daily-briefings --no-verify-jwt
--
-- Before running this file: replace vvferejzawkhzlmvvaog below. pg_cron/pg_net are
-- already enabled by 0002_schedule_ingestion.sql - safe to re-run `create
-- extension if not exists` here too in case this file runs standalone.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'generate-daily-briefings',
  '0 12 * * 1-5', -- 12:00 UTC weekdays, ahead of US market open
  $$
  select net.http_post(
    url := 'https://vvferejzawkhzlmvvaog.functions.supabase.co/generate-daily-briefings',
    headers := jsonb_build_object('Content-Type', 'application/json')
  );
  $$
);
