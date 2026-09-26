-- ============================================================================
-- Regression test for migration 0047 (fix/btc-symbol-mapping): one ticker,
-- two instruments.
--
-- historical_prices is keyed by (symbol, ts), so a coin and a listed security
-- that share a ticker overwrite each other's bars. Live on 2026-09-26: BTC
-- held 541 Grayscale ETF bars ($37) and 127 Bitcoin bars under one symbol, and
-- 57 more tickers carried the wrong class (CVX was all Convex Finance, META had
-- MetaDAO rows next to Meta's). A stored BTC analysis quoted a 99.96% drawdown
-- that was the ETF price divided by the coin price.
--
-- This file checks:
--   * the guard: a bar whose class contradicts symbol_directory is refused,
--     and a directory row cannot silently switch between coin and listed;
--   * the repair: the live shapes above are cleaned the way the migration
--     cleans production, and nothing correct is removed.
--
-- Run: psql -d <db> -v ON_ERROR_STOP=1 -f supabase/tests/asset_class_guard.sql
-- ============================================================================
\set ON_ERROR_STOP on
\pset pager off
\o /dev/null

begin;

create temp table results (case_name text, expected text, actual text, passed boolean);

-- Runs `stmt` and records whether it raised. Each attempt is its own
-- subtransaction, so a refused write leaves nothing behind.
create or replace function pg_temp.expect_refused(case_name text, stmt text) returns void
language plpgsql as $$
declare raised text := 'no error';
begin
  begin
    execute stmt;
  exception when others then
    raised := sqlerrm;
  end;
  insert into results values (case_name, 'refused', raised, raised <> 'no error');
end $$;

create or replace function pg_temp.expect_allowed(case_name text, stmt text) returns void
language plpgsql as $$
declare raised text := 'allowed';
begin
  begin
    execute stmt;
  exception when others then
    raised := sqlerrm;
  end;
  insert into results values (case_name, 'allowed', raised, raised = 'allowed');
end $$;

-- ---------------------------------------------------------------- the guard
insert into symbol_directory (symbol, asset_type, name, status, bars) values
  ('ZBTC', 'crypto', 'Test Coin', 'available', 0),
  ('ZCVX', 'equity', 'Test Oil Corp', 'available', 0);

select pg_temp.expect_allowed('a coin bar under a crypto symbol is stored',
  $s$insert into historical_prices (symbol, asset_type, ts, close) values ('ZBTC', 'crypto', '2026-09-21', 78000)$s$);

select pg_temp.expect_refused('an ETF bar under a crypto symbol is refused (the BTC defect)',
  $s$insert into historical_prices (symbol, asset_type, ts, close) values ('ZBTC', 'etf', '2026-09-22', 37.16)$s$);

select pg_temp.expect_refused('an upsert cannot turn a stored coin bar into an ETF bar',
  $s$insert into historical_prices (symbol, asset_type, ts, close) values ('ZBTC', 'etf', '2026-09-21', 37.16)
     on conflict (symbol, ts) do update set asset_type = excluded.asset_type, close = excluded.close$s$);

select pg_temp.expect_refused('a coin bar under an equity symbol is refused (the CVX defect)',
  $s$insert into historical_prices (symbol, asset_type, ts, close) values ('ZCVX', 'crypto', '2026-09-22', 2.41)$s$);

select pg_temp.expect_allowed('equity and ETF are one listed class, so a relabel is not refused',
  $s$insert into historical_prices (symbol, asset_type, ts, close) values ('ZCVX', 'etf', '2026-09-22', 150)$s$);

select pg_temp.expect_allowed('a symbol with no directory row is not blocked',
  $s$insert into historical_prices (symbol, asset_type, ts, close) values ('ZNEW', 'crypto', '2026-09-22', 1)$s$);

insert into results
select 'the refused coin-to-ETF upsert left the Bitcoin bar untouched', '78000 crypto',
       close::text || ' ' || asset_type, close = 78000 and asset_type = 'crypto'
from historical_prices where symbol = 'ZBTC' and ts = '2026-09-21';

select pg_temp.expect_refused('the directory cannot switch a coin to an ETF (how BTC was re-filed)',
  $s$update symbol_directory set asset_type = 'etf', name = 'Test Trust ETF' where symbol = 'ZBTC'$s$);

select pg_temp.expect_allowed('the directory may still move between listed types',
  $s$update symbol_directory set asset_type = 'etf' where symbol = 'ZCVX'$s$);

-- A deliberate correction (like migration 0039's) opts in for its own
-- transaction only; set_config(..., true) is transaction-local.
select set_config('cairn.allow_asset_class_change', 'on', true);
select pg_temp.expect_allowed('a deliberate correction can switch class when it opts in',
  $s$update symbol_directory set asset_type = 'equity' where symbol = 'ZBTC'$s$);
select set_config('cairn.allow_asset_class_change', '', true);

select pg_temp.expect_refused('without the opt-in the switch is refused again',
  $s$update symbol_directory set asset_type = 'crypto' where symbol = 'ZBTC'$s$);

-- Guard results first, so a database without the guard shows which rules
-- are missing before the repair section stops on the missing function.
\o
select case when passed then 'PASS' else 'FAIL' end as result, case_name, expected, actual
from results order by passed, case_name;
\o /dev/null

-- ---------------------------------------------------------------- the repair
-- The live BTC shape: a user holds it as a coin, CoinGecko lists it, the
-- directory was re-filed as the ETF, and prices are interleaved.
insert into auth.users (id) values ('00000000-0000-0000-0000-00000000b7c0');
insert into holdings (user_id, symbol, asset_type, quantity, purchase_price, purchase_date)
values ('00000000-0000-0000-0000-00000000b7c0', 'YBTC', 'crypto', 0.000544, 60000, '2026-01-02');
insert into crypto_metrics (symbol, coingecko_id, name) values
  ('YBTC', 'ybitcoin', 'YBitcoin'),
  ('YCVX', 'yconvex', 'YConvex Finance');

-- Written before the guard's rules applied (the migration runs on rows that
-- already exist), so the trigger is bypassed for the seed only.
alter table historical_prices disable trigger historical_prices_asset_class;
alter table symbol_directory disable trigger symbol_directory_asset_class;
insert into symbol_directory (symbol, asset_type, name, status, bars) values
  ('YBTC', 'etf', 'YGrayscale Mini Trust ETF', 'available', 3),
  ('YCVX', 'equity', 'YChevron Corp', 'available', 2),
  ('YAPL', 'equity', 'YApple Inc', 'available', 1);
insert into historical_prices (symbol, asset_type, ts, close) values
  ('YBTC', 'crypto', '2026-09-20', 78100),   -- Sunday: only the coin traded
  ('YBTC', 'etf',    '2026-09-21', 37.31),   -- weekday: the ETF bar won
  ('YBTC', 'etf',    '2026-09-22', 37.16),
  ('YCVX', 'crypto', '2026-09-21', 2.41),    -- the coin's price under the oil major
  ('YCVX', 'crypto', '2026-09-22', 2.38),
  ('YAPL', 'equity', '2026-09-22', 228.10);  -- clean, must survive
alter table historical_prices enable trigger historical_prices_asset_class;
alter table symbol_directory enable trigger symbol_directory_asset_class;

insert into historical_events (id, symbol, sector, event_type, event_date, price_before, price_after) values
  ('00000000-0000-0000-0000-0000000e0001', 'YBTC', 'crypto', 'volatility_regime', '2026-02-06', 62778.22, 66042.75), -- real coin event, keep
  ('00000000-0000-0000-0000-0000000e0002', 'YCVX', 'crypto', 'volatility_regime', '2026-03-01', 2.10, 2.55),         -- coin event under an equity
  ('00000000-0000-0000-0000-0000000e0003', 'YBTC', null,     'factor_signal',     '2026-05-01', 37.10, 78400),       -- derived from the mixed history
  ('00000000-0000-0000-0000-0000000e0004', 'YAPL', null,     'volatility_regime', '2026-04-01', 200, 210);           -- clean equity event, keep

insert into ai_analyses (id, scope_type, scope_value, analysis_type, probability_low, probability_high,
                         confidence_level, sample_size, reasoning_text, model_version) values
  ('00000000-0000-0000-0000-0000000a0001', 'ticker', 'YBTC', 't', 21, 100, 'low', 1, 'drawdown -99.96%', 'm'),
  ('00000000-0000-0000-0000-0000000a0002', 'sector', 'energy', 't', 40, 60, 'low', 1, 'cites the coin event', 'm'),
  ('00000000-0000-0000-0000-0000000a0003', 'ticker', 'YAPL', 't', 40, 60, 'low', 1, 'clean', 'm');
insert into ai_analysis_historical_analogs (analysis_id, historical_event_id, similarity_score) values
  ('00000000-0000-0000-0000-0000000a0001', '00000000-0000-0000-0000-0000000e0001', 1),
  ('00000000-0000-0000-0000-0000000a0001', '00000000-0000-0000-0000-0000000e0003', 1),
  ('00000000-0000-0000-0000-0000000a0002', '00000000-0000-0000-0000-0000000e0002', 1),
  ('00000000-0000-0000-0000-0000000a0003', '00000000-0000-0000-0000-0000000e0004', 1);

create temp table repair_log as select * from public.repair_asset_class_collisions();

insert into results
select 'a coin a user holds is filed back as crypto, under its CoinGecko name', 'crypto YBitcoin',
       asset_type || ' ' || name, asset_type = 'crypto' and name = 'YBitcoin'
from symbol_directory where symbol = 'YBTC';

insert into results
select 'an equity no one holds as a coin stays an equity', 'equity',
       asset_type, asset_type = 'equity'
from symbol_directory where symbol = 'YCVX';

insert into results
select 'no stored bar contradicts its directory class after the repair', '0', count(*)::text, count(*) = 0
from historical_prices hp join symbol_directory sd using (symbol)
where (hp.asset_type = 'crypto') <> (sd.asset_type = 'crypto') and hp.symbol like 'Y%';

insert into results
select 'the coin keeps its own bar', '78100', string_agg(close::text, ','), string_agg(close::text, ',') = '78100'
from historical_prices where symbol = 'YBTC';

insert into results
select 'the equity loses the coin''s bars', '0', count(*)::text, count(*) = 0
from historical_prices where symbol = 'YCVX';

insert into results
select 'a clean symbol is untouched', '228.10', max(close)::text, max(close) = 228.10
from historical_prices where symbol = 'YAPL';

insert into results
select 'bar counts in the directory match what is stored', 'YBTC=1 YCVX=0',
       string_agg(symbol || '=' || bars, ' ' order by symbol),
       string_agg(symbol || '=' || bars, ' ' order by symbol) = 'YBTC=1 YCVX=0'
from symbol_directory where symbol in ('YBTC', 'YCVX');

insert into results
select 'wrong-class events are removed, correct ones kept', 'e0001,e0004',
       string_agg(right(id::text, 5), ',' order by id),
       string_agg(right(id::text, 5), ',' order by id) = 'e0001,e0004'
from historical_events where id::text like '00000000-0000-0000-0000-0000000e%';

insert into results
select 'analyses built on the mixed data are withdrawn (status rejected), not deleted',
       'a0001=rejected a0002=rejected a0003=validated',
       string_agg(right(id::text, 5) || '=' || status, ' ' order by id),
       string_agg(right(id::text, 5) || '=' || status, ' ' order by id) = 'a0001=rejected a0002=rejected a0003=validated'
from ai_analyses where id::text like '00000000-0000-0000-0000-0000000a%';

insert into results
select 'a withdrawn analysis keeps its link to the correct event', 'e0001',
       string_agg(right(historical_event_id::text, 5), ','), string_agg(right(historical_event_id::text, 5), ',') = 'e0001'
from ai_analysis_historical_analogs where analysis_id = '00000000-0000-0000-0000-0000000a0001';

insert into results
select 'running the repair again changes nothing', '0',
       coalesce(sum(affected), 0)::text, coalesce(sum(affected), 0) = 0
from public.repair_asset_class_collisions();

insert into results
select 'the repair reports what it changed', 'directory_reclassified=1',
       'directory_reclassified=' || affected, affected = 1
from repair_log where step = 'directory_reclassified';

\o
select case when passed then 'PASS' else 'FAIL' end as result, case_name, expected, actual
from results order by passed, case_name;

do $$
declare f int;
begin
  select count(*) into f from results where not passed;
  if f > 0 then raise exception 'ASSET CLASS GUARD TEST FAILED: % case(s)', f; end if;
  raise notice 'ASSET CLASS GUARD TEST PASSED: % cases', (select count(*) from results);
end $$;

rollback;
