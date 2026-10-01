-- ============================================================================
-- Beta invites (migration 0064).
--
-- The claim is the one thing the TypeScript cannot prove on its own: that
-- beta_invite_begin_claim() hands an invite to one caller and never two, only
-- for the invited address, and never once it is claimed, expired or revoked.
-- Plus the access rules: nothing here is reachable by anon/authenticated.
-- ============================================================================
\set ON_ERROR_STOP on
\pset pager off
\o /dev/null

begin;

create temp table results (case_name text, expected text, actual text, passed boolean);
grant all on results to public;

insert into waitlist (email, email_normalized, status, waitlist_position, founding_member) values
  ('inv-a@test.io', 'inv-a@test.io', 'confirmed', 1, true),
  ('inv-b@test.io', 'inv-b@test.io', 'confirmed', 2, true),
  ('inv-p@test.io', 'inv-p@test.io', 'pending', null, false);

insert into beta_invites (waitlist_id, token_hash)
select id, repeat('a', 64) from waitlist where email = 'inv-a@test.io';

insert into results
select 'next_in_line skips invited and unconfirmed rows', 'inv-b@test.io',
       string_agg(email, ','), string_agg(email, ',') = 'inv-b@test.io'
from beta_invite_next_in_line(10) where email like 'inv-%';

insert into results
select 'a different email reserves nothing', '0', count(*)::text, count(*) = 0
from beta_invite_begin_claim(repeat('a', 64), 'someone@test.io');

create temp table first_claim as select * from beta_invite_begin_claim(repeat('a', 64), ' INV-A@test.io ');
insert into results
select 'the invited email reserves the invite', '1', count(*)::text, count(*) = 1 from first_claim;

insert into results
select 'a second caller during a live reservation gets nothing', '0', count(*)::text, count(*) = 0
from beta_invite_begin_claim(repeat('a', 64), 'inv-a@test.io');

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000b1', 'inv-a@test.io');
insert into results
select 'finish_claim marks it claimed, once', 'true,false',
       a::text || ',' || b::text, a and not b
from (select beta_invite_finish_claim((select invite_id from first_claim), '00000000-0000-0000-0000-0000000000b1') as a) x,
     lateral (select beta_invite_finish_claim((select invite_id from first_claim), '00000000-0000-0000-0000-0000000000b1') as b) y;

update beta_invites set claim_started_at = now() - interval '1 hour' where token_hash = repeat('a', 64);
insert into results
select 'a claimed invite is never reserved again', '0', count(*)::text, count(*) = 0
from beta_invite_begin_claim(repeat('a', 64), 'inv-a@test.io');

insert into beta_invites (waitlist_id, token_hash, expires_at)
select id, repeat('b', 64), now() - interval '1 second' from waitlist where email = 'inv-b@test.io';
insert into results
select 'an expired invite cannot be claimed', '0', count(*)::text, count(*) = 0
from beta_invite_begin_claim(repeat('b', 64), 'inv-b@test.io');

update beta_invites set expires_at = now() + interval '1 day', revoked_at = now() where token_hash = repeat('b', 64);
insert into results
select 'a revoked invite cannot be claimed', '0', count(*)::text, count(*) = 0
from beta_invite_begin_claim(repeat('b', 64), 'inv-b@test.io');

create or replace function pg_temp.can_execute(r text) returns int language sql as $$
  select count(*)::int from pg_proc p where p.proname like 'beta_invite%' and has_function_privilege(r, p.oid, 'execute');
$$;
insert into results
select 'anon cannot execute any beta_invite function', '0', pg_temp.can_execute('anon')::text, pg_temp.can_execute('anon') = 0;
insert into results
select 'authenticated cannot execute any beta_invite function', '0', pg_temp.can_execute('authenticated')::text, pg_temp.can_execute('authenticated') = 0;

create or replace function pg_temp.visible_as(r text) returns int language plpgsql as $$
declare n int;
begin
  execute format('set local role %I', r);
  select count(*) into n from beta_invites;
  reset role;
  return n;
exception when insufficient_privilege then
  reset role;
  return 0;
end $$;
insert into results
select 'anon sees no invite rows', '0', pg_temp.visible_as('anon')::text, pg_temp.visible_as('anon') = 0;
insert into results
select 'authenticated sees no invite rows', '0', pg_temp.visible_as('authenticated')::text, pg_temp.visible_as('authenticated') = 0;

\o
select case when passed then 'PASS' else 'FAIL' end as result, case_name, expected, actual
from results order by passed, case_name;

do $$
declare f int;
begin
  select count(*) into f from results where not passed;
  if f > 0 then raise exception 'BETA INVITES TEST FAILED: % case(s)', f; end if;
  raise notice 'BETA INVITES TEST PASSED: % cases', (select count(*) from results);
end $$;

rollback;
