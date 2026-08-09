-- SAMPLE calendar data — NOT real, NOT ingested from a provider.
--
-- There is currently no ingestion source wired for calendar_events. Sources
-- probed and rejected during Phase 7:
--   * Yahoo Finance v7 quote API (earningsTimestamp/dividendDate) — now 401s
--   * Yahoo Finance v8 chart API with events=div,split — returns empty events
--   * federalreserve.gov/json/calendar.json — archive only, no future events
--
-- A real calendar needs a provider with forward-looking data (e.g. Financial
-- Modeling Prep, Finnhub, or Polygon — all key-gated). Until one is added as a
-- data_providers row with a matching Edge Function adapter, this file lets you
-- exercise the calendar UI and the Phase 4 "upcoming events next to a related
-- analysis" tie-in without pretending the dates are accurate.
--
-- Dates are relative to when this is run, so the rows stay in the future.
-- DELETE THESE ROWS before showing the app to anyone who might mistake them
-- for real scheduled events.

insert into calendar_events (symbol, event_type, event_date, title, metadata) values
  ('AAPL',  'earnings', current_date + 7,  'Apple Inc. — quarterly earnings (SAMPLE)',        '{"sample": true}'::jsonb),
  ('NVDA',  'earnings', current_date + 12, 'NVIDIA Corp. — quarterly earnings (SAMPLE)',      '{"sample": true}'::jsonb),
  ('MSFT',  'earnings', current_date + 14, 'Microsoft Corp. — quarterly earnings (SAMPLE)',   '{"sample": true}'::jsonb),
  ('AAPL',  'dividend', current_date + 3,  'Apple Inc. — ex-dividend date (SAMPLE)',          '{"sample": true}'::jsonb),
  ('MSFT',  'dividend', current_date + 9,  'Microsoft Corp. — ex-dividend date (SAMPLE)',     '{"sample": true}'::jsonb),
  (null,    'economic', current_date + 2,  'FOMC rate decision (SAMPLE)',                     '{"sample": true}'::jsonb),
  (null,    'economic', current_date + 5,  'CPI release (SAMPLE)',                            '{"sample": true}'::jsonb),
  (null,    'economic', current_date + 16, 'Nonfarm payrolls (SAMPLE)',                       '{"sample": true}'::jsonb),
  ('TSLA',  'split',    current_date + 21, 'Tesla Inc. — stock split effective (SAMPLE)',     '{"sample": true}'::jsonb),
  (null,    'ipo',      current_date + 11, 'Example Co. — expected IPO pricing (SAMPLE)',     '{"sample": true}'::jsonb);

-- To remove:
--   delete from calendar_events where metadata->>'sample' = 'true';
