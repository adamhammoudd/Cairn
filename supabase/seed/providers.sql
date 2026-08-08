-- Example data_providers rows. Edit weights/enabled flags directly in the table —
-- that's the point of Phase 2 (re-weight/add sources with no code deploy).
-- newsapi_org needs an API key: set config.api_key before enabling.

insert into data_providers (name, provider_type, endpoint, weight, priority, enabled, config) values
  ('Reuters Business (RSS)', 'news', 'https://feeds.reuters.com/reuters/businessNews', 1.0, 10, true,
    '{"adapter": "rss"}'::jsonb),
  ('AP Top Business News (RSS)', 'news', 'https://rsshub.app/apnews/topics/apf-topnews', 0.9, 20, true,
    '{"adapter": "rss"}'::jsonb),
  ('NewsAPI.org — business', 'news', 'https://newsapi.org/v2/top-headlines?category=business&language=en', 0.8, 30, false,
    '{"adapter": "newsapi_org", "api_key": ""}'::jsonb),
  ('SEC EDGAR full-text search', 'filings', 'https://efts.sec.gov/LATEST/search-index?q=%22guidance%22&forms=8-K', 1.0, 15, true,
    '{"adapter": "sec_edgar_fulltext"}'::jsonb),
  ('Stooq daily OHLCV', 'market_data', 'https://stooq.com/q/d/l/', 1.0, 10, true,
    '{"adapter": "stooq_csv", "symbols": ["aapl.us", "msft.us", "nvda.us", "googl.us", "amzn.us", "tsla.us", "spy.us"], "asset_type": "equity"}'::jsonb)
on conflict (name) do nothing;
