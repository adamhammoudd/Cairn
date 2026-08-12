-- Example data_providers rows. Edit weights/enabled flags directly in the table —
-- that's the point of Phase 2 (re-weight/add sources with no code deploy).
-- newsapi_org needs an API key: set config.api_key before enabling.

insert into data_providers (name, provider_type, endpoint, weight, priority, enabled, config) values
  ('MarketWatch Top Stories (RSS)', 'news', 'https://feeds.content.dowjones.io/public/rss/mw_topstories', 1.0, 10, true,
    '{"adapter": "rss"}'::jsonb),
  ('Yahoo Finance News (RSS)', 'news', 'https://finance.yahoo.com/news/rssindex', 0.9, 20, true,
    '{"adapter": "rss"}'::jsonb),
  ('Federal Reserve Press Releases (RSS)', 'news', 'https://www.federalreserve.gov/feeds/press_all.xml', 1.0, 5, true,
    '{"adapter": "rss"}'::jsonb),
  ('NewsAPI.org — business', 'news', 'https://newsapi.org/v2/top-headlines?category=business&language=en', 0.8, 30, false,
    '{"adapter": "newsapi_org", "api_key": ""}'::jsonb),
  ('SEC EDGAR full-text search', 'filings', 'https://efts.sec.gov/LATEST/search-index?q=%22guidance%22&forms=8-K', 1.0, 15, true,
    '{"adapter": "sec_edgar_fulltext"}'::jsonb),
  ('Yahoo Finance daily OHLCV', 'market_data', 'https://query1.finance.yahoo.com/v8/finance/chart/', 1.0, 10, true,
    '{"adapter": "yahoo_finance_chart", "symbols": ["AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "TSLA", "SPY"], "asset_type": "equity"}'::jsonb),
  -- CoinGecko previously had its base URL hardcoded in ingest-crypto rather
  -- than read from this table, so enabling/disabling or repointing it needed
  -- a code deploy — the one place Phase 2's "no deploy to re-weight/adjust a
  -- source" guarantee didn't actually hold. Reuses 'market_data' as the
  -- provider_type (crypto market data is still market data); the CoinGecko-
  -- specific pagination/rate-limit logic stays in code since that's inherent
  -- to the adapter, not something a config row can express.
  ('CoinGecko (crypto)', 'market_data', 'https://api.coingecko.com/api/v3', 1.0, 20, true,
    '{"adapter": "coingecko"}'::jsonb)
on conflict (name) do nothing;
