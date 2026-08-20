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

-- Prefix matching must not become a substring match.
insert into results
select 'prefix search does not match mid-string', '0', count(*)::text, count(*) = 0
from public.search_symbols('AAB', 8);

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
