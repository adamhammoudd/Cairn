-- SUPERSEDED by 0032_cron_secret_via_vault.sql - do not run this one.
--
-- This migration's `alter database postgres set app.settings.cron_secret`
-- requires superuser, which hosted Supabase projects are not given:
--   ERROR: 42501: permission denied to set parameter "app.settings.cron_secret"
-- It could never actually be applied here. 0032 does the same job via Vault,
-- which Supabase does grant access to. Kept as a record of the first attempt.
--
-- Re-schedules every job to present the shared secret the Edge Functions now
-- require (supabase/functions/_shared/auth.ts).
--
-- The functions are deployed --no-verify-jwt so pg_cron can reach them without
-- a user token. That left them callable by anyone with curl: an empty POST to
-- https://<ref>.functions.supabase.co/ingest-news ran a full ingestion cycle,
-- fanning out to four keyless upstream providers. generate-daily-briefings
-- wrote rows for every user in the database.
--
-- The secret is read from a database setting, so this migration is committable
-- and the value is not. Set both sides out of band before applying:
--
--   supabase secrets set CRON_SECRET=<random>
--   alter database postgres set app.settings.cron_secret = '<same random>';
--
-- Re-scheduling under the same jobname replaces the command in place, so this
-- is safe to re-run and creates no duplicate jobs.
--
-- Note: net.http_post is asynchronous. cron.job_run_details records whether the
-- *statement* succeeded, not whether the HTTP call did -- which is why the
-- broken <project-ref> jobs logged "succeeded" for months. Verify with fresh
-- rows in the target table, or by joining net._http_response.

do $$
declare
  secret text := current_setting('app.settings.cron_secret', true);
  base   text := 'https://vvferejzawkhzlmvvaog.functions.supabase.co/';
  job    record;
begin
  if secret is null or secret = '' then
    raise exception using
      message = 'app.settings.cron_secret is not set',
      hint = 'Run: alter database postgres set app.settings.cron_secret = ''<random>''; and supabase secrets set CRON_SECRET=<same>. Without it every scheduled job would 401.';
  end if;

  for job in
    select * from (values
      ('ingest-news-every-15-min',       '*/15 * * * *',  'ingest-news',               5000),
      ('ingest-market-data-daily',       '0 22 * * 1-5',  'ingest-market-data',        60000),
      ('generate-daily-briefings',       '0 12 * * 1-5',  'generate-daily-briefings',  60000),
      ('ingest-historical-events-daily', '30 22 * * 1-5', 'ingest-historical-events',  60000),
      ('ingest-fundamentals-weekly',     '0 6 * * 1',     'ingest-fundamentals',       60000),
      ('ingest-calendar-daily',          '30 6 * * *',    'ingest-calendar',           60000),
      ('evaluate-alerts-post-close',     '15 22 * * 1-5', 'evaluate-alerts',           30000),
      ('evaluate-alerts-morning',        '0 13 * * 1-5',  'evaluate-alerts',           30000),
      ('ingest-crypto',                  '0 */2 * * *',   'ingest-crypto',             60000)
    ) as t(jobname, schedule, fn, timeout_ms)
  loop
    perform cron.schedule(
      job.jobname,
      job.schedule,
      format(
        $cmd$
        select net.http_post(
          url := %L,
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-cairn-cron-secret', current_setting('app.settings.cron_secret', true)
          ),
          timeout_milliseconds := %s
        );
        $cmd$,
        base || job.fn,
        job.timeout_ms
      )
    );
  end loop;
end $$;
