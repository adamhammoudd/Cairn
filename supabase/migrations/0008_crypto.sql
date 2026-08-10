-- Phase 9: crypto and multi-asset support.
--
-- Two changes, both driven by the same finding: crypto's data profile is not
-- equity's, and Phase 4's engine silently assumed equity.

-- 1. Point-in-time crypto market metrics. Deliberately NOT folded into
--    `fundamentals` — that table holds SEC-reported per-share accounting
--    figures, and circulating supply / 24h volume are neither per-share nor
--    reported. Overloading it would make "shares_outstanding" mean two
--    different things depending on asset type.
create table if not exists crypto_metrics (
  id bigserial primary key,
  symbol text not null,
  coingecko_id text not null,
  name text not null,
  market_cap numeric,
  total_volume_24h numeric,
  circulating_supply numeric,
  max_supply numeric,
  price_change_24h_pct numeric,
  market_cap_rank int,
  updated_at timestamptz not null default now(),
  unique (symbol)
);

create index if not exists crypto_metrics_rank_idx on crypto_metrics (market_cap_rank);

alter table crypto_metrics enable row level security;
drop policy if exists "public read" on crypto_metrics;
create policy "public read" on crypto_metrics for select using (true);

-- 2. Crypto has no earnings, splits, or dividends — the only event types
--    historical_events accepted. That meant every crypto analysis failed
--    Phase 4's completeness gate (which requires at least one historical
--    analog) and was rejected before storage.
--
--    The fix is a real analog source for crypto rather than a weaker gate:
--    volatility regimes derived from actual ingested price history. These are
--    computed from real closes, not asserted.
alter table historical_events drop constraint if exists historical_events_event_type_check;
alter table historical_events add constraint historical_events_event_type_check
  check (event_type in ('earnings','split','dividend','macro','ipo','guidance','volatility_regime'));
