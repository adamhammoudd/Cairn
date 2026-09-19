-- Global symbol directory: make every listed symbol FINDABLE, keeping prices
-- on demand.
--
-- Where this came from. 0027 shipped lazy ingestion, so any symbol the provider
-- carries can already be fetched on first request - RKLB, 7974.T, ^GSPC all
-- resolve today. What it did not do is make them DISCOVERABLE: search_symbols
-- reads symbol_directory, which only ever held symbols somebody had already
-- looked up (80 rows). So the product could serve any ticker in the world, on
-- the condition that the user already knew its exact provider symbol. Nobody
-- knows that Nintendo is 7974.T. The universe was never the limit; the index
-- was.
--
-- This migration adds the missing status so a symbol can be listed in the
-- directory WITHOUT claiming its prices are stored:
--
--   'available'  provider returned bars, they are in historical_prices
--   'listed'     the symbol exists (SEC / CoinGecko reference data), nothing
--                fetched yet - selecting it ingests, exactly as an unknown
--                ticker does today
--
-- 'listed' is deliberately a separate value rather than reusing 'available'.
-- searchSymbols() reports every row it returns to the UI, and calling a row
-- with zero bars "tracked" would put a symbol in front of someone and then show
-- them an empty chart. The status is the honest signal and the UI reads it.

-- ------------------------------------------------------------------- 1. status
alter table public.symbol_directory
  drop constraint if exists symbol_directory_status_check;

alter table public.symbol_directory
  add constraint symbol_directory_status_check
  check (status in ('available', 'listed', 'unavailable', 'rate_limited', 'error'));

comment on column public.symbol_directory.status is
  'available = bars stored; listed = known to exist, not yet ingested (seeded '
  'reference data); unavailable/rate_limited/error = provider outcomes. See '
  'scripts/seed-symbol-directory.mjs.';

-- --------------------------------------------------------------- 2. search fit
-- The directory goes from ~80 rows to ~27,000, and search_symbols matches names
-- with `ilike '%' || prefix || '%'`. A leading wildcard cannot use a btree
-- index, so symbol_directory_name_idx stops helping at exactly the point the
-- table gets big. pg_trgm + GIN indexes the substring match itself, which is
-- what keeps the type-ahead answering every keystroke.
create extension if not exists pg_trgm;

create index if not exists symbol_directory_symbol_trgm_idx
  on public.symbol_directory using gin (symbol gin_trgm_ops);

create index if not exists symbol_directory_name_trgm_idx
  on public.symbol_directory using gin (lower(name) gin_trgm_ops);

-- ------------------------------------------------------------------ 3. the RPC
-- Two changes from 0027's version: 'listed' rows are returned, and the status
-- drives the ordering so a symbol whose data is already stored outranks one
-- that would need fetching. Ticker-exact still wins overall - typing AAPL must
-- put AAPL first whatever its status.
create or replace function public.search_symbols(prefix text, max_results integer default 8)
returns table(symbol text, asset_type text, name text, status text)
language sql
stable
set search_path to 'public'
as $function$
  select d.symbol, d.asset_type, coalesce(d.name, c.name) as name, d.status
  from symbol_directory d
  left join crypto_metrics c on c.symbol = d.symbol
  where d.status in ('available', 'listed')
    and (
      d.symbol ilike prefix || '%'
      or d.name ilike '%' || prefix || '%'
      or c.name ilike '%' || prefix || '%'
    )
  order by
    -- exact ticker first, then already-ingested, then ticker prefix, then name
    (d.symbol ilike prefix) desc,
    (d.status = 'available') desc,
    (d.symbol ilike prefix || '%') desc,
    d.symbol
  limit greatest(1, least(max_results, 50));
$function$;
