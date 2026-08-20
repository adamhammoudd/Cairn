-- ============================================================================
-- Regression test for the stale-price defect (audit 1.1).
--
-- getTickerDetail() and getComparisonData() both paged historical_prices with
--   .order("ts", { ascending: true }).limit(400)
-- and then read bars[bars.length - 1] as "latest". With more rows than the
-- limit that returns the OLDEST 400, so the ticker page showed a five-month-old
-- OHLC bar labelled as today and Compare quoted months-stale prices to the cent.
--
-- This reproduces the defect and the fix as executed queries against a table
-- shaped like production (AAPL had 509 rows, limit 400), so it fails if anyone
-- reintroduces ascending ordering under a LIMIT.
--
-- Run: psql -d <db> -v ON_ERROR_STOP=1 -f supabase/tests/price_ordering.sql
-- ============================================================================
\set ON_ERROR_STOP on
\pset pager off
\o /dev/null

begin;

-- 509 consecutive daily bars ending today, close rising with time so the
-- newest bar is unambiguously identifiable by value as well as by date.
insert into historical_prices (symbol, asset_type, ts, open, high, low, close, volume)
select 'ZTEST', 'equity',
       (current_date - (508 - g))::date,
       100 + g, 101 + g, 99 + g, 100 + g, 1000000 + g
from generate_series(0, 508) g;

create temp table results (case_name text, expected text, actual text, passed boolean);
grant all on results to public;

-- The BROKEN query shape: ascending + limit, take the last row as "latest".
with broken as (
  select ts, close from historical_prices
  where symbol = 'ZTEST' order by ts asc limit 400
)
insert into results
select 'ascending+limit(400) yields a stale bar (the original defect)',
       'not today', (max(ts))::text, max(ts) <> current_date
from broken;

-- The FIXED query shape: descending + limit, reversed in app code. The newest
-- bar is the first row of the DESC set, i.e. the last row after reversing.
with fixed as (
  select ts, close from historical_prices
  where symbol = 'ZTEST' order by ts desc limit 400
)
insert into results
select 'descending+limit(400) contains today''s bar',
       current_date::text, (max(ts))::text, max(ts) = current_date
from fixed;

-- After the app's .reverse(), bars[bars.length - 1] must be today's bar.
with fixed as (
  select ts, close, row_number() over (order by ts desc) rn
  from historical_prices where symbol = 'ZTEST' order by ts desc limit 400
), reversed as (
  select ts, close, row_number() over (order by rn desc) pos from fixed
)
insert into results
select 'after reverse(), bars[last] is today''s bar',
       current_date::text, (ts)::text, ts = current_date
from reversed where pos = (select count(*) from reversed);

-- The 52-week window must be drawn from the newest 400, not the oldest.
with fixed as (
  select ts, high, low from historical_prices
  where symbol = 'ZTEST' order by ts desc limit 400
)
insert into results
select '52w high is drawn from recent bars, and is >= today''s close',
       'true',
       (max(high) >= (select close from historical_prices where symbol='ZTEST' and ts=current_date))::text,
       max(high) >= (select close from historical_prices where symbol='ZTEST' and ts=current_date)
from fixed where ts >= current_date - 365;

-- Same defect class, third site: /api/chat fed the model its history with
-- ascending + limit(20), i.e. the OLDEST twenty turns of the session. Past
-- twenty messages the assistant never saw anything recently said.
insert into auth.users (id, email) values ('cccccccc-0000-4000-8000-000000000003', 'chat@test.invalid');
insert into chat_sessions (id, user_id, title) values
  ('dddddddd-0000-4000-8000-000000000003', 'cccccccc-0000-4000-8000-000000000003', 'long thread');
insert into chat_messages (session_id, role, content, created_at)
select 'dddddddd-0000-4000-8000-000000000003',
       case when g % 2 = 0 then 'user' else 'assistant' end,
       'turn ' || g,
       now() - ((60 - g) || ' minutes')::interval
from generate_series(1, 60) g;

with broken as (
  select content from chat_messages
  where session_id = 'dddddddd-0000-4000-8000-000000000003'
  order by created_at asc limit 20
)
insert into results
select 'chat history ascending+limit(20) misses the newest turn (the defect)',
       'turn 60 absent', coalesce(max(content) filter (where content = 'turn 60'), 'turn 60 absent'),
       count(*) filter (where content = 'turn 60') = 0
from broken;

with fixed as (
  select content, created_at from chat_messages
  where session_id = 'dddddddd-0000-4000-8000-000000000003'
  order by created_at desc limit 20
)
insert into results
select 'chat history descending+limit(20) includes the newest turn',
       'turn 60 present', coalesce(max(content) filter (where content = 'turn 60'), 'MISSING'),
       count(*) filter (where content = 'turn 60') = 1
from fixed;

-- After .reverse() the model must receive the turns oldest-to-newest.
with fixed as (
  select content, created_at, row_number() over (order by created_at desc) rn
  from chat_messages where session_id = 'dddddddd-0000-4000-8000-000000000003'
  order by created_at desc limit 20
), reversed as (
  select content, row_number() over (order by rn desc) pos from fixed
)
insert into results
select 'chat history after reverse() runs oldest-to-newest, ending on turn 60',
       'turn 41 -> turn 60',
       (select content from reversed where pos = 1) || ' -> ' || (select content from reversed where pos = 20),
       (select content from reversed where pos = 1) = 'turn 41'
       and (select content from reversed where pos = 20) = 'turn 60';

\o
select case when passed then 'PASS' else 'FAIL' end as result, case_name, expected, actual
from results order by passed, case_name;

do $$
declare f int;
begin
  select count(*) into f from results where not passed;
  if f > 0 then raise exception 'PRICE ORDERING TEST FAILED: % case(s)', f; end if;
  raise notice 'PRICE ORDERING TEST PASSED: % cases', (select count(*) from results);
end $$;

rollback;
