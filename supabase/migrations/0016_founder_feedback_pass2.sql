-- Founder feedback pass 2.
--
-- 1. fundamentals.sector: getSectorHeatmap() selects `sector` from this table,
--    but the column was never created (0004_fundamentals.sql). PostgREST fails
--    the whole select, so every symbol fell through to "Unclassified" and the
--    heat map rendered a single tile. Adding the column is the root fix; the
--    seed below classifies the symbols currently ingested.
-- 2. user_settings: four preferences for features that shipped without being
--    configurable (Markets default filter, default alert channels, default
--    comparison timeframe, assistant response behaviour).

-- ingest-fundamentals already writes sicDescription -> sector and sic on every
-- upsert, but neither column existed: PostgREST rejected the whole select in
-- getSectorHeatmap(), so every symbol fell through to "Unclassified" and the
-- heat map rendered one tile.
alter table public.fundamentals
  add column if not exists sector text,
  add column if not exists sic text;

comment on column public.fundamentals.sic is
  'SEC Standard Industrial Classification code. Paired with sector (SEC sicDescription).';

comment on column public.fundamentals.sector is
  'GICS-style sector name. Null when the data source has not classified the symbol.';

alter table public.user_settings
  add column if not exists default_asset_filter text not null default 'all',
  add column if not exists default_alert_channels text[] not null default array['in_app'],
  add column if not exists default_comparison_timeframe text not null default '3M',
  add column if not exists assistant_expand_methodology boolean not null default true,
  add column if not exists assistant_use_portfolio_context boolean not null default true;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'user_settings_default_asset_filter_check') then
    alter table public.user_settings
      add constraint user_settings_default_asset_filter_check
      check (default_asset_filter in ('all', 'equity', 'etf', 'crypto', 'forex', 'future'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'user_settings_default_comparison_timeframe_check') then
    alter table public.user_settings
      add constraint user_settings_default_comparison_timeframe_check
      check (default_comparison_timeframe in ('1D', '1W', '1M', '3M', '1Y', 'ALL'));
  end if;
end $$;

-- Per-chat overrides. Null means "inherit the account-level preference".
alter table public.chat_sessions
  add column if not exists expand_methodology boolean,
  add column if not exists use_portfolio_context boolean;

-- Sector classification for the equities currently ingested, taken from SEC
-- EDGAR submissions (sicDescription / sic) -- the same source and the same
-- taxonomy ingest-fundamentals writes, so a re-run agrees with these rows
-- rather than overwriting them with different labels.
--
-- Coverage note: this is SIC industry classification, not GICS sectors. SPY is
-- an ETF trust and EDGAR returns no sicDescription for it; crypto has no
-- equity-sector concept at all. Both stay unclassified rather than being
-- assigned a made-up sector.
insert into public.fundamentals (symbol, as_of_date, sector, sic, source)
values
  ('AAPL',  current_date, 'Electronic Computers',                                '3571', 'sec_xbrl'),
  ('AMZN',  current_date, 'Retail-Catalog & Mail-Order Houses',                  '5961', 'sec_xbrl'),
  ('GOOGL', current_date, 'Services-Computer Programming, Data Processing, Etc.', '7370', 'sec_xbrl'),
  ('MSFT',  current_date, 'Services-Prepackaged Software',                       '7372', 'sec_xbrl'),
  ('NVDA',  current_date, 'Semiconductors & Related Devices',                    '3674', 'sec_xbrl'),
  ('TSLA',  current_date, 'Motor Vehicles & Passenger Car Bodies',               '3711', 'sec_xbrl')
on conflict (symbol) do update set sector = excluded.sector, sic = excluded.sic;
