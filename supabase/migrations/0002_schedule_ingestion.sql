-- Schedules the two ingestion Edge Functions via pg_cron + pg_net.
--
-- Both functions must be deployed with --no-verify-jwt so pg_cron can call
-- them without presenting a secret:
--   supabase functions deploy ingest-news --no-verify-jwt
--   supabase functions deploy ingest-market-data --no-verify-jwt
-- The functions still use their own env-injected SUPABASE_SERVICE_ROLE_KEY
-- internally to write to the DB — --no-verify-jwt only means the *caller*
-- (pg_cron) doesn't need to authenticate to invoke them.
--
-- Before running: replace vvferejzawkhzlmvvaog below. Adjust schedules to taste.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'ingest-news-every-15-min',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://vvferejzawkhzlmvvaog.functions.supabase.co/ingest-news',
    headers := jsonb_build_object('Content-Type', 'application/json')
  );
  $$
);

select cron.schedule(
  'ingest-market-data-daily',
  '0 22 * * 1-5', -- 22:00 UTC weekdays, after US market close
  $$
  select net.http_post(
    url := 'https://vvferejzawkhzlmvvaog.functions.supabase.co/ingest-market-data',
    headers := jsonb_build_object('Content-Type', 'application/json')
  );
  $$
);
