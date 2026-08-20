-- historical_events had no natural key, so re-running an ingestion would have
-- accumulated duplicate analogs and quietly inflated every sample_size.
create unique index if not exists historical_events_symbol_type_date_key
  on historical_events (symbol, event_type, event_date)
  where symbol is not null;

-- Equity analog ingestion (earnings / dividends / splits). Runs after the
-- daily price load so the reaction window it measures has the newest bar.
select cron.schedule(
  'ingest-historical-events-daily',
  '30 22 * * 1-5',
  $$
  select net.http_post(
    url := 'https://vvferejzawkhzlmvvaog.functions.supabase.co/ingest-historical-events',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    timeout_milliseconds := 60000
  );
  $$
);
