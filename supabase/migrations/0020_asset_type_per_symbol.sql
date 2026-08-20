-- asset_type was read once per data_providers row and applied to every symbol
-- under it, so all seven tracked equities-and-SPY were written as "equity".
-- The Markets page filters historical_prices.asset_type, which is why its ETF,
-- Forex and Indices tabs were permanently empty while SPY sat in the equity
-- list labelled EQUITY.
--
-- ingest-market-data now reads a per-symbol asset_type (see readSymbols() in
-- that function). This rewrites the provider config into the object form for
-- the symbols that need a type other than the provider default, and corrects
-- the rows already ingested.

-- 1. Provider config: keep plain strings for the equities, promote SPY.
update data_providers
set config = jsonb_set(
  config,
  '{symbols}',
  (
    select jsonb_agg(
      case
        when sym in ('SPY', 'QQQ', 'IWM', 'DIA', 'VTI', 'VOO')
          then jsonb_build_object('symbol', sym, 'asset_type', 'etf')
        else to_jsonb(sym)
      end
      order by ord
    )
    from jsonb_array_elements_text(config -> 'symbols') with ordinality as t(sym, ord)
  )
)
where provider_type = 'market_data'
  and enabled
  and jsonb_typeof(config -> 'symbols') = 'array'
  -- Only rewrite configs still in the plain-string form; re-running must not
  -- double-wrap entries that are already objects.
  and not exists (
    select 1 from jsonb_array_elements(config -> 'symbols') e
    where jsonb_typeof(e) = 'object'
  );

-- 2. Correct rows already written under the provider-wide type. Scoped to the
-- known ETF tickers rather than blanket-updating, so a genuine equity is never
-- reclassified by accident.
update historical_prices
set asset_type = 'etf'
where asset_type = 'equity'
  and symbol in ('SPY', 'QQQ', 'IWM', 'DIA', 'VTI', 'VOO');
