-- Local stand-ins for the pg_cron / pg_net extensions so the scheduling
-- migrations can be executed and the *resulting registered job commands*
-- inspected, rather than eyeballed in the file. cron.schedule upserts by
-- jobname exactly as the real extension does.
create schema if not exists cron;
create schema if not exists net;

create table if not exists cron.job (
  jobid bigserial primary key,
  jobname text unique,
  schedule text not null,
  command text not null
);

create or replace function cron.schedule(job_name text, schedule text, command text)
returns bigint language plpgsql as $$
declare jid bigint;
begin
  insert into cron.job (jobname, schedule, command) values (job_name, schedule, command)
  on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command
  returning jobid into jid;
  return jid;
end $$;

create or replace function cron.unschedule(job_name text) returns boolean
language plpgsql as $$ begin delete from cron.job where jobname = job_name; return true; end $$;

create table if not exists net._http_response (id bigserial primary key, status_code int, created timestamptz default now());
create or replace function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
  headers jsonb default '{}'::jsonb, timeout_milliseconds int default 5000)
returns bigint language sql as $$ select 1::bigint $$;
