-- pg_net's per-request timeout on the scheduled ingestion jobs.
--
-- Migration 0017 raised every cron job's net.http_post timeout from pg_net's
-- 5s default to 60s, because the Edge Functions run longer than 5s and
-- net._http_response was recording nothing but "Timeout of 5000 ms reached" -
-- i.e. there was no observable success/failure signal for ingestion at all.
--
-- `ingest-news-every-15-min` (jobid 1) was later re-created (cron-secret / vault
-- rework) with an explicit `timeout_milliseconds := 5000` instead of the 60s
-- value, so it is the one job still abandoning its response before the function
-- returns. Every other job is already at 30-120s:
--
--   jobname                        timeout_milliseconds
--   ingest-news-every-15-min       5000     <- this migration -> 60000
--   ingest-market-data-daily       60000
--   generate-daily-briefings       120000
--   ingest-fundamentals-weekly     60000
--   ingest-calendar-daily          60000
--   evaluate-alerts-*              30000
--   ingest-crypto                  60000
--   ingest-historical-events-daily 60000
--   purge-scope-guard-log          (no http_post - SQL only)
--
-- Re-register every job whose command carries a sub-30s timeout, bumping it to
-- 60s. Idempotent: a job already at >= 30s is left alone, so a re-run is a
-- no-op.
do $$
declare
  j record;
  v_ms int;
begin
  for j in
    select jobid, jobname, schedule, command
    from cron.job
    where command like '%timeout_milliseconds%'
  loop
    v_ms := (regexp_match(j.command, 'timeout_milliseconds\s*:=\s*(\d+)'))[1]::int;
    if v_ms is not null and v_ms < 30000 then
      perform cron.schedule(
        j.jobname,
        j.schedule,
        regexp_replace(
          j.command,
          'timeout_milliseconds\s*:=\s*\d+',
          'timeout_milliseconds := 60000',
          'g'
        )
      );
    end if;
  end loop;
end $$;
