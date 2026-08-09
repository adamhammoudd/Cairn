-- Phase 2 extension: fundamentals, so the Phase 7 screener can filter on
-- market cap, P/E, and dividend yield instead of price/volume alone.
--
-- Source is SEC EDGAR's XBRL companyconcept API (keyless, no rate-limit key
-- required beyond a declared User-Agent). We store the raw reported figures
-- and derive market cap / P/E / yield at query time against historical_prices,
-- rather than storing derived values that would go stale as prices move.

create table fundamentals (
  id bigserial primary key,
  symbol text not null,
  as_of_date date not null,
  shares_outstanding numeric,
  eps_ttm numeric,
  dividends_ttm numeric,
  source text not null default 'sec_xbrl',
  updated_at timestamptz not null default now(),
  unique (symbol)
);

create index on fundamentals (symbol);

alter table fundamentals enable row level security;
create policy "public read" on fundamentals for select using (true);
