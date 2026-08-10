-- Schedules evaluate-alerts via pg_cron + pg_net.
--
-- Deploy first:  supabase functions deploy evaluate-alerts --no-verify-jwt
-- Then replace <project-ref> below and run this file.
--
-- Cadence note: the alert conditions evaluate against daily OHLCV bars, so
-- running more often than the market-data ingest would just re-read the same
-- bar and burn invocations. This runs shortly after ingest-market-data
-- (22:00 UTC weekdays), plus a morning pass to catch ai_confidence alerts
-- against analyses generated overnight. Cooldowns handle the rest.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'evaluate-alerts-post-close',
  '15 22 * * 1-5',
  $$
  select net.http_post(
    url := 'https://<project-ref>.functions.supabase.co/evaluate-alerts',
    headers := jsonb_build_object('Content-Type', 'application/json')
  );
  $$
);

select cron.schedule(
  'evaluate-alerts-morning',
  '0 13 * * 1-5',
  $$
  select net.http_post(
    url := 'https://<project-ref>.functions.supabase.co/evaluate-alerts',
    headers := jsonb_build_object('Content-Type', 'application/json')
  );
  $$
);
