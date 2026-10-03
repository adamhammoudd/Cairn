-- ============================================================================
-- discussion_threads policies (migration 0066, audit 2026-10-02 item 2.2).
--
--  * anon cannot read the table at all
--  * a signed-in user cannot read another user's FLAGGED comment, can read their
--    own flagged one, and can read others' unflagged ones
--  * an author cannot change their own upvotes / downvotes / flagged
--  * an author can change their own body, and not someone else's
--  * an insert cannot set upvotes / downvotes / flagged
--
-- Same method as rls_idor.sql: real rows, then each statement run as role
-- `authenticated` / `anon` with a sub claim.
-- Run: psql -d <db> -v ON_ERROR_STOP=1 -f supabase/tests/discussion_lockdown.sql
-- ============================================================================
\set ON_ERROR_STOP on
\pset pager off
begin;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'alice@test.invalid'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'bob@test.invalid');

insert into discussion_threads (id, symbol, user_id, body, flagged) values
  ('d1000000-0000-4000-8000-000000000001', 'AAPL', 'aaaaaaaa-0000-4000-8000-000000000001', 'alice clean',   false),
  ('d1000000-0000-4000-8000-000000000002', 'AAPL', 'aaaaaaaa-0000-4000-8000-000000000001', 'alice flagged', true),
  ('d1000000-0000-4000-8000-000000000003', 'AAPL', 'bbbbbbbb-0000-4000-8000-000000000002', 'bob clean',     false),
  ('d1000000-0000-4000-8000-000000000004', 'AAPL', 'bbbbbbbb-0000-4000-8000-000000000002', 'bob flagged',   true);

create temp table results (case_name text, expected int, actual int, passed boolean);
grant all on results to public;

-- Denied by USING (zero rows) or by privilege / WITH CHECK (42501) both count as
-- a denial; any other error is re-raised so a typo cannot pass as a denial.
create or replace function assert_count(case_name text, stmt text, expected int)
returns void language plpgsql as $$
declare n int;
begin
  execute stmt into n;
  insert into results values (case_name, expected, coalesce(n,0), coalesce(n,0) = expected);
exception
  when insufficient_privilege then
    insert into results values (case_name || ' [denied by privilege]', expected, 0, expected = 0);
end $$;

\o /dev/null
-- ---- anon -----------------------------------------------------------------
set local role anon;
select assert_count('ANON  read any discussion comment',
  $q$select count(*) from discussion_threads$q$, 0);

-- ---- Alice (authenticated) ------------------------------------------------
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);

select assert_count('READ  bob flagged comment',
  $q$select count(*) from discussion_threads where id = 'd1000000-0000-4000-8000-000000000004'$q$, 0);
select assert_count('READ  bob clean comment',
  $q$select count(*) from discussion_threads where id = 'd1000000-0000-4000-8000-000000000003'$q$, 1);
select assert_count('READ  own flagged comment',
  $q$select count(*) from discussion_threads where id = 'd1000000-0000-4000-8000-000000000002'$q$, 1);
select assert_count('READ  every row visible to alice (3 = own two + bob clean)',
  $q$select count(*) from discussion_threads$q$, 3);

select assert_count('WRITE own upvotes',
  $q$with u as (update discussion_threads set upvotes = 999 where id = 'd1000000-0000-4000-8000-000000000001' returning 1) select count(*) from u$q$, 0);
select assert_count('WRITE own downvotes',
  $q$with u as (update discussion_threads set downvotes = 999 where id = 'd1000000-0000-4000-8000-000000000001' returning 1) select count(*) from u$q$, 0);
select assert_count('WRITE own flagged (clear the spam flag)',
  $q$with u as (update discussion_threads set flagged = false where id = 'd1000000-0000-4000-8000-000000000002' returning 1) select count(*) from u$q$, 0);
select assert_count('WRITE own body (allowed)',
  $q$with u as (update discussion_threads set body = 'edited' where id = 'd1000000-0000-4000-8000-000000000001' returning 1) select count(*) from u$q$, 1);
select assert_count('WRITE bob body',
  $q$with u as (update discussion_threads set body = 'hacked' where id = 'd1000000-0000-4000-8000-000000000003' returning 1) select count(*) from u$q$, 0);
select assert_count('INSERT with upvotes preset',
  $q$with i as (insert into discussion_threads (symbol, user_id, body, upvotes) values ('AAPL', 'aaaaaaaa-0000-4000-8000-000000000001', 'x', 50) returning 1) select count(*) from i$q$, 0);
select assert_count('INSERT with flagged explicitly set',
  $q$with i as (insert into discussion_threads (symbol, user_id, body, flagged) values ('AAPL', 'aaaaaaaa-0000-4000-8000-000000000001', 'x', false) returning 1) select count(*) from i$q$, 0);
select assert_count('INSERT plain comment as self (allowed)',
  $q$with i as (insert into discussion_threads (symbol, user_id, body) values ('AAPL', 'aaaaaaaa-0000-4000-8000-000000000001', 'ok') returning 1) select count(*) from i$q$, 1);
select assert_count('INSERT as someone else',
  $q$with i as (insert into discussion_threads (symbol, user_id, body) values ('AAPL', 'bbbbbbbb-0000-4000-8000-000000000002', 'forged') returning 1) select count(*) from i$q$, 0);

reset role;
\o

select case when passed then 'PASS' else 'FAIL' end as result, case_name, expected, actual from results order by passed, case_name;
do $$
declare f int;
begin
  select count(*) into f from results where not passed;
  if f > 0 then raise exception 'DISCUSSION LOCKDOWN TEST FAILED: % case(s)', f; end if;
  raise notice 'DISCUSSION LOCKDOWN TEST PASSED: % cases', (select count(*) from results);
end $$;
rollback;
