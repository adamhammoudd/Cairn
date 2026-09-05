-- Fixes item 2 of docs/audits/2026-09-05-fix-sweep.md: five crypto symbols
-- stored with the wrong asset_type in symbol_directory, confirmed by the
-- Screener's Crypto filter excluding all of them.
--
-- Root cause, more precisely than "someone entered the wrong value": these
-- are genuine ticker-string COLLISIONS between a real crypto coin and an
-- unrelated equity/ETF that happens to share the same ticker. symbol_directory
-- has one row per symbol (symbol is the primary key, migration 0027), so
-- whichever instrument's on-demand search/ingest reached that row FIRST won
-- the only slot - the crypto coin never got one of its own.
--
--   APT   -> Aptos (crypto)          was: "Alpha Pro Tech, Ltd." (equity)
--   ARB   -> Arbitrum (crypto)       was: "AltShares Merger Arbitrage ETF" (etf)
--   ATOM  -> Cosmos Hub (crypto)     was: "Atomera Incorporated" (equity)
--   M     -> MemeCore (crypto)       was: "Macy's, Inc." (equity) -- found by
--                                    the full sweep below, not named in the
--                                    original report
--   NEAR  -> NEAR Protocol (crypto)  was: "iShares Short Duration Bond Active
--                                    ETF" (etf)
--
-- Full-sweep query this list came from (every symbol_directory row whose
-- symbol also has a real crypto_metrics entry, i.e. CoinGecko says it's a
-- coin, but the stored asset_type disagrees):
--
--   select cm.symbol, cm.name as coingecko_name, sd.asset_type, sd.name
--   from crypto_metrics cm join symbol_directory sd on sd.symbol = cm.symbol
--   where sd.asset_type <> 'crypto';
--
-- The reverse check (a symbol_directory row tagged 'crypto' with no matching
-- crypto_metrics row at all - i.e. wrongly tagged crypto) returned zero rows,
-- so this is a one-directional problem: real coins mistagged as something
-- else, never the other way around.
--
-- WHAT THIS MIGRATION DOES NOT FIX: historical_prices has BOTH asset classes'
-- daily bars coexisting under the same (symbol, ts) key for all five symbols
-- (confirmed: e.g. 'APT' carries 113 rows tagged asset_type='crypto' AND 506
-- rows tagged asset_type='equity'). Since (symbol, ts) is the upsert conflict
-- key, whichever ingestion job ran most recently for a given date is the row
-- that survives there - the two asset classes have been silently overwriting
-- each other's bars in the overlapping date range. Fixing that properly needs
-- a decision (e.g. reject/rename one side of the collision at ingest time,
-- or key historical_prices by (symbol, asset_type, ts) instead of
-- (symbol, ts)) rather than a data patch, and isn't attempted here - flagged
-- in the fix-sweep report for a founder decision.

update symbol_directory
set asset_type = 'crypto',
    name = 'Aptos',
    last_checked_at = now()
where symbol = 'APT';

update symbol_directory
set asset_type = 'crypto',
    name = 'Arbitrum',
    last_checked_at = now()
where symbol = 'ARB';

update symbol_directory
set asset_type = 'crypto',
    name = 'Cosmos Hub',
    last_checked_at = now()
where symbol = 'ATOM';

update symbol_directory
set asset_type = 'crypto',
    name = 'MemeCore',
    last_checked_at = now()
where symbol = 'M';

update symbol_directory
set asset_type = 'crypto',
    name = 'NEAR Protocol',
    last_checked_at = now()
where symbol = 'NEAR';
