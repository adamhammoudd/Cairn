-- On-demand (lazy) symbol ingestion -- option (b) in
-- docs/decisions/2026-08-20-universe-size.md.
--
-- The tracked universe was a config row: 7 equities, then 31 after the bounded
-- interim in 0026. A beta tester typing RKLB was told "No matching tracked
-- symbols" for a symbol the provider had data for all along. Pre-populating
-- "every ticker" is not achievable on a keyless feed, but fetching a symbol
-- the first time someone asks for it is, and it scales with real demand
-- instead of a guess.
--
-- Three things this needs that the schema did not have:
--   1. somewhere to record what has been looked up, so a miss is not re-fetched
--      on every keystroke and an unavailable symbol is remembered as such;
--   2. a real `index` asset type, so indices stop being filed under `future`;
--   3. per-symbol price reads, because every "latest N bars" query in the app
--      shares one interleaved row budget and starves as the universe grows.

-- ---------------------------------------------------------------- 1. registry
create table if not exists symbol_directory (
  symbol text primary key,
  asset_type text not null check (asset_type in ('equity','etf','crypto','forex','index','future')),
  name text,
  -- 'available'    provider returned bars, they are in historical_prices
  -- 'unavailable'  provider has no such symbol (delisted / typo / uncovered)
  -- 'rate_limited' provider refused this attempt; retry after a cooldown
  -- 'error'        transport or parse failure; retry after a cooldown
  status text not null check (status in ('available','unavailable','rate_limited','error')),
  provider text not null default 'yahoo_finance_chart',
  bars int not null default 0,
  detail text,
  first_seen_at timestamptz not null default now(),
  last_checked_at timestamptz not null default now(),
  last_success_at timestamptz,
  -- Demand signal: what the daily refresh job should keep warm, so the cron
  -- set follows real usage instead of growing without bound.
  last_requested_at timestamptz not null default now(),
  request_count int not null default 1
);

create index if not exists symbol_directory_status_idx on symbol_directory (status);
create index if not exists symbol_directory_requested_idx on symbol_directory (last_requested_at desc);
create index if not exists symbol_directory_name_idx on symbol_directory (lower(name));

alter table symbol_directory enable row level security;
drop policy if exists "public read" on symbol_directory;
create policy "public read" on symbol_directory for select using (true);
-- Writes are service-role only (the ingest path), which bypasses RLS; no
-- policy is granted to anon/authenticated deliberately.

grant select on symbol_directory to anon, authenticated;
grant all on symbol_directory to service_role;

-- Backfill what is already ingested so the directory is authoritative from the
-- first deploy rather than filling in only as symbols are searched.
insert into symbol_directory (symbol, asset_type, name, status, bars, last_success_at, last_checked_at)
select hp.symbol,
       -- one row per symbol; asset_type comes from its most recent bar
       (array_agg(hp.asset_type order by hp.ts desc))[1],
       -- crypto is the only asset class that already had names stored;
       -- everything else picks its name up on its next ingest.
       (select c.name from crypto_metrics c where c.symbol = hp.symbol),
       'available',
       count(*)::int,
       now(),
       now()
from historical_prices hp
group by hp.symbol
on conflict (symbol) do update set
  bars = excluded.bars,
  name = coalesce(symbol_directory.name, excluded.name),
  last_checked_at = excluded.last_checked_at;

-- --------------------------------------------------------- 2. `index` type
-- ASSET_TYPE_LABEL mapped the Markets "Indices" tab onto asset_type 'future'
-- because there was no index type to store. Yahoo reports instrumentType
-- INDEX for ^GSPC and FUTURE for a real future; collapsing them made the
-- Indices tab a lie either way.
alter table historical_prices drop constraint if exists historical_prices_asset_type_check;
alter table historical_prices add constraint historical_prices_asset_type_check
  check (asset_type in ('equity','etf','crypto','forex','index','future'));

-- The Markets/Settings "Indices" filter stores this column, so it has to accept
-- the new type or choosing Indices in Settings fails a check constraint.
alter table user_settings drop constraint if exists user_settings_default_asset_filter_check;
alter table user_settings add constraint user_settings_default_asset_filter_check
  check (default_asset_filter in ('all', 'equity', 'etf', 'crypto', 'forex', 'index', 'future'));

-- ------------------------------------------------- 3. per-symbol price reads
-- Every "most recent N bars" read in the app was a single query ordered by ts
-- with one shared LIMIT across all symbols: screener/markets capped at 2000
-- rows total, watchlists at symbols*30, the sector map at symbols*6. Because
-- the rows interleave by date, a symbol that trades on days others do not
-- (crypto over a weekend) eats the budget and the rest silently lose bars --
-- a wrong sparkline and a null % change, with no error anywhere. The cap also
-- shrinks per symbol as the universe grows, which lazy ingestion guarantees.
--
-- LATERAL gives each symbol its own LIMIT, so the budget is per symbol and the
-- result no longer depends on how many other symbols exist.
create or replace function public.recent_prices(symbols text[], per_symbol int default 30)
returns table (
  symbol text, asset_type text, ts date,
  open numeric, high numeric, low numeric, close numeric, volume bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select p.symbol, p.asset_type, p.ts, p.open, p.high, p.low, p.close, p.volume
  from unnest(symbols) as s(symbol)
  cross join lateral (
    select hp.symbol, hp.asset_type, hp.ts, hp.open, hp.high, hp.low, hp.close, hp.volume
    from historical_prices hp
    where hp.symbol = s.symbol
    order by hp.ts desc
    limit greatest(1, least(per_symbol, 2000))
  ) p;
$$;

comment on function public.recent_prices(text[], int) is
  'Most recent N bars for each of the given symbols, newest first within a symbol. Per-symbol LIMIT: unlike a single ORDER BY ts LIMIT it cannot starve one symbol of rows because another has more recent bars.';

-- Same shape for the whole tracked universe (Markets, Screener, Sector map),
-- which cannot enumerate its symbols up front once ingestion is on demand.
create or replace function public.recent_prices_all(per_symbol int default 12, asset_types text[] default null)
returns table (
  symbol text, asset_type text, ts date,
  open numeric, high numeric, low numeric, close numeric, volume bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select p.symbol, p.asset_type, p.ts, p.open, p.high, p.low, p.close, p.volume
  from (
    select distinct hp.symbol from historical_prices hp
    where asset_types is null or hp.asset_type = any(asset_types)
  ) as s
  cross join lateral (
    select hp.symbol, hp.asset_type, hp.ts, hp.open, hp.high, hp.low, hp.close, hp.volume
    from historical_prices hp
    where hp.symbol = s.symbol
    order by hp.ts desc
    limit greatest(1, least(per_symbol, 2000))
  ) p;
$$;

comment on function public.recent_prices_all(int, text[]) is
  'Most recent N bars for every ingested symbol. Replaces the app-wide "order by ts desc limit 2000" reads, whose per-symbol depth shrank as the universe grew.';

grant execute on function public.recent_prices(text[], int) to anon, authenticated, service_role;
grant execute on function public.recent_prices_all(int, text[]) to anon, authenticated, service_role;

-- -------------------------------------------------- 4. search over the directory
-- searchSymbols() could only ever match a symbol prefix against
-- historical_prices, so a name search ("rocket lab") found nothing and a
-- symbol with no bars yet could not be surfaced at all. The directory carries
-- the display name and the availability status, so search can offer a symbol
-- that is known-unavailable as such rather than silently omitting it.
-- The signature gains columns, so the old definition has to go first;
-- `create or replace` cannot change a function's return type.
drop function if exists public.search_symbols(text, int);

create function public.search_symbols(prefix text, max_results int default 8)
returns table (symbol text, asset_type text, name text, status text)
language sql
stable
security invoker
set search_path = public
as $$
  select d.symbol, d.asset_type, coalesce(d.name, c.name) as name, d.status
  from symbol_directory d
  left join crypto_metrics c on c.symbol = d.symbol
  where d.status = 'available'
    and (
      d.symbol ilike prefix || '%'
      or d.name ilike '%' || prefix || '%'
      or c.name ilike '%' || prefix || '%'
    )
  order by
    -- exact ticker first, then ticker prefix, then name matches
    (d.symbol ilike prefix) desc,
    (d.symbol ilike prefix || '%') desc,
    d.symbol
  limit greatest(1, least(max_results, 50));
$$;

comment on function public.search_symbols(text, int) is
  'Prefix/name search over the symbol directory. Limited by symbol (the directory has one row per symbol), and returns the display name so equities are no longer symbol-only in the type-ahead.';

grant execute on function public.search_symbols(text, int) to anon, authenticated, service_role;
