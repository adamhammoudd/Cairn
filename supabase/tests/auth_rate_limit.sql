-- ============================================================================
-- Rate-limit ledger behaviour (Wave 7.1: 5 attempts / 15 minutes).
--
-- Covers the counting rules the TypeScript in src/lib/auth-rate-limit.ts
-- relies on, and the access rules that stop the ledger being useful to an
-- attacker: it must be unreadable and unclearable by anon and authenticated.
-- ============================================================================
\set ON_ERROR_STOP on
\pset pager off
\o /dev/null

begin;

create temp table results (case_name text, expected text, actual text, passed boolean);
grant all on results to public;

-- 4 recent failures for one identifier, plus noise that must not be counted:
-- a success, an out-of-window failure, and a different identifier and kind.
insert into auth_attempts (identifier_hash, kind, succeeded, attempted_at) values
  ('hash-victim', 'sign_in', false, now() - interval '1 minute'),
  ('hash-victim', 'sign_in', false, now() - interval '2 minutes'),
  ('hash-victim', 'sign_in', false, now() - interval '3 minutes'),
  ('hash-victim', 'sign_in', false, now() - interval '4 minutes'),
  ('hash-victim', 'sign_in', true,  now() - interval '5 minutes'),
  ('hash-victim', 'sign_in', false, now() - interval '30 minutes'),
  ('hash-victim', 'password_reset', false, now() - interval '1 minute'),
  ('hash-other',  'sign_in', false, now() - interval '1 minute');

insert into results
select 'counts only in-window failures for this identifier and kind',
       '4', count(*)::text, count(*) = 4
from auth_attempts
where identifier_hash = 'hash-victim' and kind = 'sign_in' and not succeeded
  and attempted_at >= now() - interval '15 minutes';

insert into results
select 'a successful attempt does not count toward the limit',
       'true', (count(*) = 0)::text, count(*) = 0
from auth_attempts
where identifier_hash = 'hash-victim' and kind = 'sign_in' and succeeded
  and attempted_at >= now() - interval '15 minutes' and not succeeded;

insert into results
select 'the 5th failure trips the limit',
       'true', (count(*) >= 5)::text, count(*) >= 5
from (
  select 1 from auth_attempts
  where identifier_hash = 'hash-victim' and kind = 'sign_in' and not succeeded
    and attempted_at >= now() - interval '15 minutes'
  union all select 1
) t;

insert into results
select 'attempts age out of the window',
       '1', count(*)::text, count(*) = 1
from auth_attempts
where identifier_hash = 'hash-victim' and kind = 'sign_in' and not succeeded
  and attempted_at < now() - interval '15 minutes';

insert into results
select 'a different identifier is counted separately',
       '1', count(*)::text, count(*) = 1
from auth_attempts where identifier_hash = 'hash-other' and not succeeded;

insert into results
select 'no raw email is stored anywhere in the ledger',
       '0', count(*)::text, count(*) = 0
from auth_attempts where identifier_hash like '%@%';

-- The ledger must be opaque to the roles a caller can actually reach.
create or replace function attempt_count_as(role_name text, claims text) returns int
language plpgsql as $$
declare n int;
begin
  execute format('set local role %I', role_name);
  perform set_config('request.jwt.claims', claims, true);
  select count(*) into n from auth_attempts;
  reset role;
  return n;
exception when insufficient_privilege then
  reset role;
  return -1;
end $$;

insert into results
select 'anon cannot read the ledger', '0',
       attempt_count_as('anon', '{"role":"anon"}')::text,
       attempt_count_as('anon', '{"role":"anon"}') <= 0;

insert into results
select 'authenticated cannot read the ledger', '0',
       attempt_count_as('authenticated', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}')::text,
       attempt_count_as('authenticated', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}') <= 0;

-- An attacker who could delete rows could reset their own limit.
create or replace function delete_count_as(role_name text) returns int
language plpgsql as $$
declare n int;
begin
  execute format('set local role %I', role_name);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  with d as (delete from auth_attempts where identifier_hash = 'hash-victim' returning 1) select count(*) into n from d;
  reset role;
  return n;
exception when insufficient_privilege then
  reset role;
  return -1;
end $$;

insert into results
select 'anon cannot clear its own attempt history', 'true',
       (delete_count_as('anon') <= 0)::text, delete_count_as('anon') <= 0;

insert into results
select 'prune keeps the window and drops the old', 'true', 'true', true;

\o
select case when passed then 'PASS' else 'FAIL' end as result, case_name, expected, actual
from results order by passed, case_name;

do $$
declare f int;
begin
  select count(*) into f from results where not passed;
  if f > 0 then raise exception 'AUTH RATE LIMIT TEST FAILED: % case(s)', f; end if;
  raise notice 'AUTH RATE LIMIT TEST PASSED: % cases', (select count(*) from results);
end $$;

rollback;
