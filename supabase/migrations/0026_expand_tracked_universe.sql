-- Wave 5, bounded interim.
--
-- The tracked universe was 7 equities because of a config row, not a provider
-- limit: the audit pulled all 24 of these long-tail tickers from the same
-- Yahoo feed Cairn already uses, and a beta tester typing RKLB -- Rocket Lab,
-- not obscure -- was told "No matching tracked symbols" and concluded the app
-- was broken.
--
-- This adds the 24 symbols the audit proved available, correctly typed, so the
-- daily cron keeps them fresh. Their 2y of history has been backfilled from
-- the same endpoint ingest-market-data uses.
--
-- Deliberately a bounded list rather than an open-ended crawl: ingest-market-
-- data fetches serially with no backoff and no concurrency limit, and Yahoo's
-- public chart endpoint publishes no quota, so jumping to several hundred
-- symbols is a change that needs throttling first or it fails the same quiet
-- way the cron jobs did.
--
-- This does NOT foreclose the open universe-size decision in
-- docs/decisions/2026-08-20-universe-size.md. Lazy/on-demand ingestion is
-- still the recommendation there. This makes the reported failure stop
-- happening in the meantime, at a size that is verifiable today.
update data_providers
set config = jsonb_set(
  config,
  '{symbols}',
  (config -> 'symbols') || jsonb_build_array(
    'AXON','CROX','CELH','SMCI','PLAB','KTOS','IONQ','BROS','RKLB','PENN',
    'ASML','TSM','BABA','SAP','SHOP',
    jsonb_build_object('symbol','IWM','asset_type','etf'),
    jsonb_build_object('symbol','XLE','asset_type','etf'),
    jsonb_build_object('symbol','VNQ','asset_type','etf'),
    jsonb_build_object('symbol','ARKG','asset_type','etf'),
    jsonb_build_object('symbol','SCHD','asset_type','etf'),
    jsonb_build_object('symbol','EEM','asset_type','etf'),
    jsonb_build_object('symbol','JEPI','asset_type','etf'),
    jsonb_build_object('symbol','TLT','asset_type','etf'),
    jsonb_build_object('symbol','GDX','asset_type','etf')
  )
)
where provider_type = 'market_data'
  and enabled
  and config ->> 'adapter' = 'yahoo_finance_chart'
  -- Re-running must not duplicate entries.
  and not (config -> 'symbols' @> '["RKLB"]'::jsonb);
