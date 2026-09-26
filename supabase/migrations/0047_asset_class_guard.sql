-- 0047: one ticker, two instruments (fix/btc-symbol-mapping)
--
-- WHAT WAS WRONG (live, 2026-09-26)
--   symbol_directory filed BTC as "Grayscale Bitcoin Mini Trust ETF" (etf) and
--   the newest stored BTC close was $37.16, while a user holds BTC as a coin.
--   historical_prices is unique on (symbol, ts), so the ETF's weekday bars had
--   replaced Bitcoin's, and only weekend bars (when the ETF does not trade)
--   were still the coin: 541 ETF rows next to 127 Bitcoin rows. The stored
--   BTC analysis quoted a 99.96% drawdown - the ETF price over the coin price.
--
--   The same collision ran the other way for 57 more tickers. ingest-crypto
--   writes history for CoinGecko's top 250 coins, and many share a ticker with
--   a listed security: CVX's stored history was entirely Convex Finance, not
--   Chevron; META carried MetaDAO rows between Meta's, and a validated META
--   analysis cited analogs like "1.53 -> 755.40". 19,424 price rows in all.
--
-- HOW BTC WAS RE-FILED
--   The on-demand lookup (src/lib/market-data/ingest.ts) tried the bare
--   ticker before the coin pair even for a symbol already known to be a coin.
--   Yahoo answers `BTC` with the ETF, so a routine refresh overwrote the
--   directory row's type. The nightly on-demand pass then refreshed "BTC" as
--   an ETF every day. The code fix ships in the same PR; this migration adds
--   the database backstop and repairs the rows.
--
-- WHAT THIS DOES
--   1. Guard: a price bar whose class (coin vs listed) contradicts
--      symbol_directory is refused, and a directory row cannot switch between
--      coin and listed unless the transaction opts in with
--        select set_config('cairn.allow_asset_class_change', 'on', true);
--      Equity <-> ETF is not a class change (Yahoo relabels funds).
--   2. Repair, via repair_asset_class_collisions() (idempotent, tested in
--      supabase/tests/asset_class_guard.sql):
--        a. a directory row is filed back as crypto when a user holds that
--           symbol as crypto, CoinGecko lists it, and nobody holds it as
--           anything else (BTC is the only such row today);
--        b. price rows that contradict the directory are deleted;
--        c. derived events built from the wrong instrument are deleted:
--           coin volatility regimes (sector 'crypto') under a listed symbol,
--           listed regimes under a coin, and factor_signal analogs of any
--           symbol whose history was mixed;
--        d. analyses that cite such an event, or are ticker analyses of a
--           mixed symbol, are WITHDRAWN (status 'rejected'; the app only reads
--           'validated'), not deleted. Their links to deleted events are
--           removed; links to correct events stay.
--        e. symbol_directory.bars is recounted for the repaired symbols.
--
-- AFTER APPLYING
--   BTC keeps only its genuine coin bars until ingest-crypto's next run,
--   which refreshes held coins first and rewrites 365 days of history.
--   Listed symbols that lost coin rows (CVX, A, AR, ...) re-fetch from Yahoo
--   the next time anyone opens them.
--
-- NOT FIXED HERE (decision for Adam, see the PR)
--   With one row per (symbol, ts), a coin and a listed security still cannot
--   both be tracked under one ticker; the directory decides which one the app
--   shows. Keying historical_prices by (symbol, asset_type, ts) would let both
--   coexist but touches every price reader.

-- ------------------------------------------------------------------ 1. guard

create or replace function public.enforce_price_asset_class()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  dir_type text;
begin
  select asset_type into dir_type from symbol_directory where symbol = new.symbol;
  if dir_type is not null and (dir_type = 'crypto') <> (new.asset_type = 'crypto') then
    raise exception using
      errcode = '23514',
      message = format('historical_prices: %s is filed as %s in symbol_directory; refusing a %s bar for %s',
                       new.symbol, dir_type, new.asset_type, new.ts),
      hint = 'Two instruments share this ticker. See supabase/migrations/0047_asset_class_guard.sql.';
  end if;
  return new;
end;
$$;

drop trigger if exists historical_prices_asset_class on historical_prices;
create trigger historical_prices_asset_class
  before insert or update of symbol, asset_type on historical_prices
  for each row execute function public.enforce_price_asset_class();

create or replace function public.enforce_directory_asset_class()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (old.asset_type = 'crypto') <> (new.asset_type = 'crypto')
     and coalesce(current_setting('cairn.allow_asset_class_change', true), '') <> 'on' then
    raise exception using
      errcode = '23514',
      message = format('symbol_directory: refusing to re-file %s from %s to %s',
                       old.symbol, old.asset_type, new.asset_type),
      hint = 'A coin and a listed security share this ticker. A deliberate correction must run '
             'select set_config(''cairn.allow_asset_class_change'', ''on'', true) in its own transaction.';
  end if;
  return new;
end;
$$;

drop trigger if exists symbol_directory_asset_class on symbol_directory;
create trigger symbol_directory_asset_class
  before update of asset_type on symbol_directory
  for each row execute function public.enforce_directory_asset_class();

-- ----------------------------------------------------------------- 2. repair

create or replace function public.repair_asset_class_collisions()
returns table (step text, affected bigint)
language plpgsql
set search_path = public
as $$
declare
  n bigint;
  collided text[];
  wrong_events uuid[];
begin
  -- a. Directory rows a holding contradicts.
  perform set_config('cairn.allow_asset_class_change', 'on', true);
  update symbol_directory sd
     set asset_type = 'crypto', name = cm.name, last_checked_at = now()
    from crypto_metrics cm
   where cm.symbol = sd.symbol
     and sd.asset_type <> 'crypto'
     and exists (select 1 from holdings h where h.symbol = sd.symbol and h.asset_type = 'crypto')
     and not exists (select 1 from holdings h where h.symbol = sd.symbol and h.asset_type <> 'crypto');
  get diagnostics n = row_count;
  perform set_config('cairn.allow_asset_class_change', '', true);
  step := 'directory_reclassified'; affected := n; return next;

  select coalesce(array_agg(distinct hp.symbol), '{}') into collided
    from historical_prices hp
    join symbol_directory sd on sd.symbol = hp.symbol
   where (hp.asset_type = 'crypto') <> (sd.asset_type = 'crypto');

  -- c. Events derived from the wrong instrument.
  select coalesce(array_agg(e.id), '{}') into wrong_events
    from historical_events e
    join symbol_directory sd on sd.symbol = e.symbol
   where (e.event_type = 'factor_signal' and e.symbol = any (collided))
      or (e.event_type = 'volatility_regime'
          and (coalesce(e.sector, '') = 'crypto') <> (sd.asset_type = 'crypto'));

  -- d. Withdraw what was built on them.
  update ai_analyses a
     set status = 'rejected'
   where a.status = 'validated'
     and ((a.scope_type = 'ticker' and a.scope_value = any (collided))
          or exists (select 1 from ai_analysis_historical_analogs l
                      where l.analysis_id = a.id and l.historical_event_id = any (wrong_events)));
  get diagnostics n = row_count;
  step := 'analyses_withdrawn'; affected := n; return next;

  delete from ai_analysis_historical_analogs where historical_event_id = any (wrong_events);
  get diagnostics n = row_count;
  step := 'analog_links_removed'; affected := n; return next;

  delete from historical_events where id = any (wrong_events);
  get diagnostics n = row_count;
  step := 'events_removed'; affected := n; return next;

  -- b. The price rows themselves.
  delete from historical_prices hp
   using symbol_directory sd
   where sd.symbol = hp.symbol
     and (hp.asset_type = 'crypto') <> (sd.asset_type = 'crypto');
  get diagnostics n = row_count;
  step := 'price_rows_removed'; affected := n; return next;

  -- e. Keep the directory's bar count honest.
  update symbol_directory sd
     set bars = (select count(*) from historical_prices hp where hp.symbol = sd.symbol)
   where sd.symbol = any (collided);
  step := 'symbols_repaired'; affected := coalesce(array_length(collided, 1), 0); return next;
end;
$$;

-- Maintenance only: never callable through the public API.
revoke all on function public.repair_asset_class_collisions() from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.repair_asset_class_collisions() from anon, authenticated;
  end if;
end $$;

do $$
declare r record;
begin
  for r in select * from public.repair_asset_class_collisions() loop
    raise notice '0047 repair: % = %', r.step, r.affected;
  end loop;
end $$;
