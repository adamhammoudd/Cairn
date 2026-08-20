-- Every scheduled net.http_post used pg_net's 5s default timeout, and every
-- Edge Function takes longer than that, so net._http_response recorded
-- "Timeout of 5000 ms reached" for all 8 jobs -- including the 5 that were
-- otherwise pointing at the right URL. The functions still ran; the caller
-- just never observed the result, which is part of why the broken jobs went
-- unnoticed for 1,082 runs. Raise the timeout so the response is real.
do $$
declare
  j record;
begin
  for j in select jobid, jobname, schedule, command from cron.job loop
    if j.command like '%net.http_post%' and j.command not like '%timeout_milliseconds%' then
      perform cron.schedule(
        j.jobname,
        j.schedule,
        replace(
          j.command,
          'headers := jsonb_build_object(''Content-Type'', ''application/json'')',
          'headers := jsonb_build_object(''Content-Type'', ''application/json''),' || chr(10) ||
          '    timeout_milliseconds := 60000'
        )
      );
    end if;
  end loop;
end $$;
