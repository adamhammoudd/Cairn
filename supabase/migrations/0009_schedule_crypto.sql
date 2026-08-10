-- Schedules ingest-crypto via pg_cron + pg_net.
--
-- Deploy first:  supabase functions deploy ingest-crypto --no-verify-jwt
-- Then replace <project-ref> below and run this file.
--
-- Cadence note: CoinGecko's free tier only tolerates a handful of history
-- calls per invocation (see HISTORY_COINS_PER_RUN in the function), so this
-- runs every 2 hours rather than once daily — coverage across all 25 tracked
-- coins fills in over several runs via the function's own staleness-first
-- ordering, not in a single pass.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'ingest-crypto',
  '0 */2 * * *',
  $$
  select net.http_post(
    url := 'https://<project-ref>.functions.supabase.co/ingest-crypto',
    headers := jsonb_build_object('Content-Type', 'application/json')
  );
  $$
);
