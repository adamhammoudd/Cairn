-- Repairs the three pg_cron jobs that were created from the migration
-- templates before the `<project-ref>` placeholder was substituted. Jobs 1, 2
-- and 5 (ingest-news, ingest-market-data, generate-daily-briefings) posted to
-- https://<project-ref>.functions.supabase.co/... and had therefore never
-- reached an Edge Function -- 1,082 consecutive no-op runs on the news job.
--
-- Re-scheduling under the same jobname replaces the command in place, so this
-- is safe to re-run and does not create duplicate jobs.
--
-- Note: net.http_post is asynchronous. cron.job_run_details records whether
-- the *statement* succeeded, not whether the HTTP call did -- which is why the
-- broken jobs still logged "succeeded" for months. Verify ingestion by
-- checking for fresh rows in the target table, or by joining
-- net._http_response, not by reading job_run_details alone.
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
  '0 22 * * 1-5',
  $$
  select net.http_post(
    url := 'https://vvferejzawkhzlmvvaog.functions.supabase.co/ingest-market-data',
    headers := jsonb_build_object('Content-Type', 'application/json')
  );
  $$
);

select cron.schedule(
  'generate-daily-briefings',
  '0 12 * * 1-5',
  $$
  select net.http_post(
    url := 'https://vvferejzawkhzlmvvaog.functions.supabase.co/generate-daily-briefings',
    headers := jsonb_build_object('Content-Type', 'application/json')
  );
  $$
);
