-- Replaces 0023_cron_secret_header.sql's mechanism. That migration reads the
-- shared secret with current_setting('app.settings.cron_secret'), which
-- requires setting it first with:
--
--   alter database postgres set app.settings.cron_secret = '<value>';
--
-- Hosted Supabase projects are not given superuser, and that statement fails:
--
--   ERROR: 42501: permission denied to set parameter "app.settings.cron_secret"
--
-- So 0023 could never actually be applied on this project. Supabase's
-- supported mechanism for exactly this - a secret a scheduled job needs to
-- read - is Vault, which is already installed (see the now-deleted
-- `invoke-edge-function` placeholder job, which referenced
-- vault.decrypted_secrets and is the reason this path was known to exist).
--
-- Before running this migration, store the secret in Vault (out of band, not
-- committed, matching 0023's original posture for the value itself):
--
--   select vault.create_secret('<same value as Supabase secrets CRON_SECRET>', 'cron_secret', 'Shared secret cron sends to the ingestion/briefing Edge Functions');
--
-- Re-scheduling under the same jobname replaces the command in place, so this
-- is safe to re-run and creates no duplicate jobs, and safe to run whether or
-- not 0023 ever partially applied.
--
-- Note: net.http_post is asynchronous. cron.job_run_details records whether the
-- *statement* succeeded, not whether the HTTP call did. Verify with fresh rows
-- in the target table, or by joining net._http_response.

do $$
declare
  secret text;
  base   text := 'https://vvferejzawkhzlmvvaog.functions.supabase.co/';
  job    record;
begin
  select decrypted_secret into secret
  from vault.decrypted_secrets
  where name = 'cron_secret'
  limit 1;

  if secret is null or secret = '' then
    raise exception using
      message = 'No ''cron_secret'' entry in Vault',
      hint = 'Run: select vault.create_secret(''<random, matching Supabase secrets CRON_SECRET>'', ''cron_secret'', ''cron auth''); then re-run this migration.';
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
            'x-cairn-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
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
