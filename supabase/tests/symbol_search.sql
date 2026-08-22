-- ============================================================================
-- Regression test for the symbol-search coverage bug (audit 1.4a).
--
-- searchSymbols() limited historical_prices by ROW count (.limit(200)), then
-- de-duplicated in JS. AAPL has 509 price rows, so typing "A" returned 200
-- AAPL rows and nothing else -- not AMZN, which the user could see on the
-- Markets page seconds earlier. Any row-based limit has this failure built in
-- and gets worse every day the ingester runs.
--
-- Run: psql -d <db> -v ON_ERROR_STOP=1 -f supabase/tests/symbol_search.sql
-- ============================================================================
\set ON_ERROR_STOP on
\pset pager off
\o /dev/null

begin;

-- A deep-history symbol that sorts first, plus shallower ones behind it --
-- the exact shape that produced the bug.
insert into historical_prices (symbol, asset_type, ts, open, high, low, close, volume)
select 'ZAAA', 'equity', (current_date - g)::date, 1, 1, 1, 1, 1 from generate_series(1, 509) g;
insert into historical_prices (symbol, asset_type, ts, open, high, low, close, volume)
select 'ZAAB', 'equity', (current_date - g)::date, 1, 1, 1, 1, 1 from generate_series(1, 509) g;
insert into historical_prices (symbol, asset_type, ts, open, high, low, close, volume)
values ('ZAAC', 'crypto', current_date, 1, 1, 1, 1, 1),
       ('ZAAD', 'etf',    current_date, 1, 1, 1, 1, 1);

-- Since migration 0027 the search reads symbol_directory (one row per symbol,
-- carrying the provider's display name and the availability status), which is
-- what makes a name search possible and lets a known-unavailable symbol be
-- excluded rather than silently missing.
insert into symbol_directory (symbol, asset_type, name, status, bars)
values ('ZAAA', 'equity', 'Zaaa Industries', 'available', 509),
       ('ZAAB', 'equity', 'Zaab Holdings',   'available', 509),
       ('ZAAC', 'crypto', 'Zaac Protocol',   'available', 1),
       ('ZAAD', 'etf',    'Zaad Index Fund', 'available', 1),
       -- Looked up once, provider had nothing. Must never be offered as a
       -- selectable result: picking it would open a page with no data.
       ('ZAAZ', 'equity', null,              'unavailable', 0),
       -- Name shares no substring with the ticker, so it isolates symbol
       -- matching from name matching in the mid-string case below.
       ('ZQQX', 'equity', 'Northwind Freight', 'available', 1);

create temp table results (case_name text, expected text, actual text, passed boolean);
grant all on results to public;

-- The defect, reproduced: a row-limited query sees only the first symbol.
with row_limited as (
  select symbol from historical_prices where symbol ilike 'ZAA%' order by symbol limit 200
)
insert into results
select 'row-limited query surfaces only one symbol (the defect)',
       '1', count(distinct symbol)::text, count(distinct symbol) = 1
from row_limited;

-- The fix: limited by distinct symbol.
insert into results
select 'search_symbols returns every matching symbol',
       'ZAAA, ZAAB, ZAAC, ZAAD',
       string_agg(symbol, ', ' order by symbol),
       string_agg(symbol, ', ' order by symbol) = 'ZAAA, ZAAB, ZAAC, ZAAD'
from public.search_symbols('ZAA', 8);

-- asset_type must come through per symbol, not be flattened to one value.
insert into results
select 'search_symbols preserves per-symbol asset_type',
       'crypto', asset_type, asset_type = 'crypto'
from public.search_symbols('ZAAC', 8);

-- max_results is honoured, and clamped rather than trusted.
insert into results
select 'max_results caps the result set', '2', count(*)::text, count(*) = 2
from public.search_symbols('ZAA', 2);

insert into results
select 'max_results is clamped to at least 1', '1', count(*)::text, count(*) = 1
from public.search_symbols('ZAA', 0);

insert into results
select 'max_results is clamped to at most 50', 'true', (count(*) <= 50)::text, count(*) <= 50
from public.search_symbols('ZAA', 100000);

-- Ticker matching stays a PREFIX match: 'QQX' is inside ZQQX but is not a
-- prefix of it, and Northwind Freight does not contain it either, so nothing
-- should come back. (Name matching is deliberately a substring match - that
-- is what makes "rocket lab" find RKLB - and is covered separately below.)
insert into results
select 'symbol match is a prefix match, not a substring match', '0', count(*)::text, count(*) = 0
from public.search_symbols('QQX', 8);

-- The counterpart: a mid-string fragment DOES match when it is in the name.
insert into results
select 'name match is a substring match', 'ZQQX', string_agg(symbol, ', '), string_agg(symbol, ', ') = 'ZQQX'
from public.search_symbols('wind Freight', 8);

-- The display name is searchable: "rocket lab" found nothing before 0027,
-- because the only searchable column was the ticker.
insert into results
select 'name search finds a symbol by company name',
       'ZAAB', string_agg(symbol, ', '), string_agg(symbol, ', ') = 'ZAAB'
from public.search_symbols('Zaab Hold', 8);

insert into results
select 'search returns the display name',
       'Zaaa Industries', max(name), max(name) = 'Zaaa Industries'
from public.search_symbols('ZAAA', 8);

-- A symbol the provider has no data for must not appear as a result.
insert into results
select 'unavailable symbols are not offered', '0', count(*)::text, count(*) = 0
from public.search_symbols('ZAAZ', 8);

-- An exact ticker match outranks a name match on the same query.
insert into results
select 'exact ticker sorts first', 'ZAAC', (array_agg(symbol))[1], (array_agg(symbol))[1] = 'ZAAC'
from public.search_symbols('ZAAC', 8);

\o
select case when passed then 'PASS' else 'FAIL' end as result, case_name, expected, actual
from results order by passed, case_name;

do $$
declare f int;
begin
  select count(*) into f from results where not passed;
  if f > 0 then raise exception 'SYMBOL SEARCH TEST FAILED: % case(s)', f; end if;
  raise notice 'SYMBOL SEARCH TEST PASSED: % cases', (select count(*) from results);
end $$;

rollback;
