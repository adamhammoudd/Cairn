-- ============================================================================
-- Cross-user authorization (IDOR) regression test.
--
-- Cairn's server actions deliberately lean on RLS for cross-user protection in
-- several places -- listChatMessages(), addWatchlistItem(), listDeliveries()
-- all carry comments saying "RLS joins through <owner> so a foreign id returns
-- no rows". That is only true if the policies actually hold, and nothing in the
-- repo ever proved it. This does.
--
-- Method: two real users, real rows owned by each, then every read/write a
-- malicious client could attempt against the *other* user's primary keys,
-- executed as role `authenticated` with the attacker's sub claim -- exactly
-- what PostgREST does with a real JWT.
--
-- Run: psql -d <db> -v ON_ERROR_STOP=1 -f supabase/tests/rls_idor.sql
-- Exits non-zero if any case fails.
-- ============================================================================
\set ON_ERROR_STOP on
\pset pager off

begin;

-- --------------------------------------------------------------------------
-- Fixtures: Alice (attacker) and Bob (victim), each with a full row set.
-- --------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'alice@test.invalid'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'bob@test.invalid');

insert into holdings (id, user_id, symbol, quantity, purchase_price, purchase_date) values
  ('11111111-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'AAPL', 1, 100, '2026-01-02'),
  ('11111111-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000002', 'NVDA', 5, 200, '2026-01-02');

insert into watchlists (id, user_id, name) values
  ('22222222-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'alice list'),
  ('22222222-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000002', 'bob list');

insert into watchlist_items (id, watchlist_id, symbol) values
  ('33333333-0000-4000-8000-000000000001', '22222222-0000-4000-8000-000000000001', 'AAPL'),
  ('33333333-0000-4000-8000-000000000002', '22222222-0000-4000-8000-000000000002', 'TSLA');

insert into chat_sessions (id, user_id, title) values
  ('44444444-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'alice thread'),
  ('44444444-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000002', 'bob thread');

insert into chat_messages (id, session_id, role, content) values
  ('55555555-0000-4000-8000-000000000001', '44444444-0000-4000-8000-000000000001', 'user', 'alice secret'),
  ('55555555-0000-4000-8000-000000000002', '44444444-0000-4000-8000-000000000002', 'user', 'bob secret');

insert into alerts (id, user_id, alert_type, scope_value, condition) values
  ('66666666-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'price', 'AAPL', '{}'),
  ('66666666-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000002', 'price', 'NVDA', '{}');

insert into alert_deliveries (id, alert_id, channel) values
  ('77777777-0000-4000-8000-000000000001', '66666666-0000-4000-8000-000000000001', 'in_app'),
  ('77777777-0000-4000-8000-000000000002', '66666666-0000-4000-8000-000000000002', 'in_app');

insert into saved_screens (id, user_id, name, filters) values
  ('88888888-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'alice screen', '{}'),
  ('88888888-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000002', 'bob screen', '{}');

insert into daily_briefings (id, user_id, briefing_date, content) values
  ('99999999-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', '2026-08-20', '{}'),
  ('99999999-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000002', '2026-08-20', '{}');

insert into subscriptions (user_id, tier) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'free'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'premium')
on conflict (user_id) do update set tier = excluded.tier;

-- --------------------------------------------------------------------------
-- Harness. Each case asserts an *expected row count* for a statement run as
-- the attacker. A leak shows up as a count that isn't zero.
-- --------------------------------------------------------------------------
create temp table results (case_name text, expected int, actual int, passed boolean);
-- The harness records results while running *as the attacker role*, so it needs
-- write access to its own scratch table. This grant is on a temp table only and
-- has no bearing on what the policies under test allow.
grant all on results to public;

-- A policy can deny two different ways: USING filters the row out (statement
-- succeeds, zero rows) or WITH CHECK rejects the write (statement raises
-- 42501). Both are a denial, so both count as a pass -- but *only* those two.
-- Any other error is re-raised rather than being scored as a pass, so a typo'd
-- test can never masquerade as a successful denial.
create or replace function assert_count(case_name text, stmt text, expected int)
returns void language plpgsql as $$
declare n int;
begin
  execute stmt into n;
  insert into results values (case_name, expected, coalesce(n,0), coalesce(n,0) = expected);
exception
  when insufficient_privilege then
    insert into results values (case_name || ' [denied by WITH CHECK]', expected, 0, expected = 0);
end $$;

\o /dev/null
-- Become the attacker: role `authenticated`, sub = Alice. This is precisely the
-- security context PostgREST establishes for a request bearing Alice's JWT.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);

-- ---- READS: can Alice see Bob's rows by guessing his primary key? ----------
select assert_count('READ  holdings by bob id',
  $q$select count(*) from holdings where id = '11111111-0000-4000-8000-000000000002'$q$, 0);
select assert_count('READ  watchlists by bob id',
  $q$select count(*) from watchlists where id = '22222222-0000-4000-8000-000000000002'$q$, 0);
select assert_count('READ  watchlist_items by bob id',
  $q$select count(*) from watchlist_items where id = '33333333-0000-4000-8000-000000000002'$q$, 0);
select assert_count('READ  chat_sessions by bob id',
  $q$select count(*) from chat_sessions where id = '44444444-0000-4000-8000-000000000002'$q$, 0);
select assert_count('READ  chat_messages by bob session id',
  $q$select count(*) from chat_messages where session_id = '44444444-0000-4000-8000-000000000002'$q$, 0);
select assert_count('READ  alerts by bob id',
  $q$select count(*) from alerts where id = '66666666-0000-4000-8000-000000000002'$q$, 0);
select assert_count('READ  alert_deliveries by bob id',
  $q$select count(*) from alert_deliveries where id = '77777777-0000-4000-8000-000000000002'$q$, 0);
select assert_count('READ  saved_screens by bob id',
  $q$select count(*) from saved_screens where id = '88888888-0000-4000-8000-000000000002'$q$, 0);
select assert_count('READ  daily_briefings by bob id',
  $q$select count(*) from daily_briefings where id = '99999999-0000-4000-8000-000000000002'$q$, 0);
select assert_count('READ  subscriptions (bob tier)',
  $q$select count(*) from subscriptions where user_id = 'bbbbbbbb-0000-4000-8000-000000000002'$q$, 0);
select assert_count('READ  profiles (bob)',
  $q$select count(*) from profiles where user_id = 'bbbbbbbb-0000-4000-8000-000000000002'$q$, 0);
select assert_count('READ  user_settings (bob)',
  $q$select count(*) from user_settings where user_id = 'bbbbbbbb-0000-4000-8000-000000000002'$q$, 0);
-- Unscoped sweep: the "list everything" attack, no id guessing needed.
select assert_count('READ  unscoped select * from holdings returns only own',
  $q$select count(*) from holdings$q$, 1);
select assert_count('READ  unscoped select * from chat_messages returns only own',
  $q$select count(*) from chat_messages$q$, 1);
select assert_count('READ  unscoped select * from alert_deliveries returns only own',
  $q$select count(*) from alert_deliveries$q$, 1);

-- ---- WRITES: can Alice mutate or destroy Bob's rows? ----------------------
select assert_count('WRITE update bob holding',
  $q$with u as (update holdings set quantity = 999 where id = '11111111-0000-4000-8000-000000000002' returning 1) select count(*) from u$q$, 0);
select assert_count('WRITE delete bob holding',
  $q$with d as (delete from holdings where id = '11111111-0000-4000-8000-000000000002' returning 1) select count(*) from d$q$, 0);
select assert_count('WRITE delete bob watchlist_item (removeWatchlistItem path)',
  $q$with d as (delete from watchlist_items where id = '33333333-0000-4000-8000-000000000002' returning 1) select count(*) from d$q$, 0);
select assert_count('WRITE reorder bob watchlist_item (reorderWatchlistItems path)',
  $q$with u as (update watchlist_items set sort_order = 99 where id = '33333333-0000-4000-8000-000000000002' returning 1) select count(*) from u$q$, 0);
select assert_count('WRITE mark bob delivery read (markDeliveriesRead path)',
  $q$with u as (update alert_deliveries set read_at = now() where id = '77777777-0000-4000-8000-000000000002' returning 1) select count(*) from u$q$, 0);
select assert_count('WRITE rename bob chat session',
  $q$with u as (update chat_sessions set title = 'pwned' where id = '44444444-0000-4000-8000-000000000002' returning 1) select count(*) from u$q$, 0);
select assert_count('WRITE delete bob chat session',
  $q$with d as (delete from chat_sessions where id = '44444444-0000-4000-8000-000000000002' returning 1) select count(*) from d$q$, 0);
select assert_count('WRITE delete bob alert',
  $q$with d as (delete from alerts where id = '66666666-0000-4000-8000-000000000002' returning 1) select count(*) from d$q$, 0);
select assert_count('WRITE self-upgrade bob subscription to premium',
  $q$with u as (update subscriptions set tier = 'premium' where user_id = 'bbbbbbbb-0000-4000-8000-000000000002' returning 1) select count(*) from u$q$, 0);

-- ---- FORGED-OWNER INSERTS: can Alice plant rows owned by Bob? -------------
select assert_count('WRITE insert holding owned by bob',
  $q$with i as (insert into holdings (user_id, symbol, quantity, purchase_price, purchase_date)
     select 'bbbbbbbb-0000-4000-8000-000000000002','XXX',1,1,'2026-01-02'
     where (select count(*) from holdings where user_id='bbbbbbbb-0000-4000-8000-000000000002') >= 0
     returning 1) select count(*) from i$q$, 0);
select assert_count('WRITE insert watchlist_item into bob watchlist (addWatchlistItem path)',
  $q$with i as (insert into watchlist_items (watchlist_id, symbol)
     values ('22222222-0000-4000-8000-000000000002','PWN') returning 1) select count(*) from i$q$, 0);
select assert_count('WRITE insert chat_message into bob session',
  $q$with i as (insert into chat_messages (session_id, role, content)
     values ('44444444-0000-4000-8000-000000000002','user','injected') returning 1) select count(*) from i$q$, 0);

-- ---- SCOPE-GUARD LOG: default-deny table must not be readable -------------
select assert_count('READ  ai_scope_guard_log (must be service-role only)',
  $q$select count(*) from ai_scope_guard_log$q$, 0);

-- ---- ANONYMOUS: unauthenticated caller must see nothing user-scoped -------
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select assert_count('ANON  read holdings',        $q$select count(*) from holdings$q$, 0);
select assert_count('ANON  read chat_messages',   $q$select count(*) from chat_messages$q$, 0);
select assert_count('ANON  read watchlists',      $q$select count(*) from watchlists$q$, 0);
select assert_count('ANON  read subscriptions',   $q$select count(*) from subscriptions$q$, 0);
select assert_count('ANON  delete watchlist_item (removeWatchlistItem has no auth check)',
  $q$with d as (delete from watchlist_items where id = '33333333-0000-4000-8000-000000000002' returning 1) select count(*) from d$q$, 0);

reset role;
\o

-- --------------------------------------------------------------------------
-- Report
-- --------------------------------------------------------------------------
select case when passed then 'PASS' else 'FAIL' end as result,
       case_name, expected, actual
from results order by passed, case_name;

select count(*) filter (where passed) as passed,
       count(*) filter (where not passed) as failed,
       count(*) as total
from results;

do $$
declare f int;
begin
  select count(*) into f from results where not passed;
  if f > 0 then raise exception 'IDOR TEST FAILED: % case(s) leaked', f; end if;
  raise notice 'IDOR TEST PASSED: all % cases denied as expected', (select count(*) from results);
end $$;

rollback;
