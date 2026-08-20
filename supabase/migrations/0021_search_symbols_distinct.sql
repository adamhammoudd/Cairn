-- searchSymbols() paged historical_prices with .limit(200) -- a limit on price
-- ROWS, not on distinct symbols. AAPL alone has 509 rows, so typing "A"
-- returned 200 AAPL rows and nothing else: not AMZN, not ADA, no symbol that
-- happened to sort after the first match. Short prefixes could only ever
-- surface the alphabetically-first symbol, which reads as a broken search and
-- is one.
--
-- Doing this in SQL rather than by raising the row limit: the row count per
-- symbol grows every day the ingester runs, so any row-based limit is a bug
-- with a timer on it.

create or replace function public.search_symbols(prefix text, max_results int default 8)
returns table (symbol text, asset_type text)
language sql
stable
as $$
  select distinct on (hp.symbol) hp.symbol, hp.asset_type
  from historical_prices hp
  where hp.symbol ilike prefix || '%'
  order by hp.symbol, hp.ts desc
  limit greatest(1, least(max_results, 50));
$$;

comment on function public.search_symbols(text, int) is
  'Prefix search over tracked symbols, limited by DISTINCT symbol rather than by price row. asset_type is taken from the most recent bar.';

grant execute on function public.search_symbols(text, int) to anon, authenticated, service_role;
