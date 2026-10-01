-- Daily ECB reference rates, so a holding's cost can be converted at the rate on
-- its purchase date (fix/cost-basis-fx).
--
-- Numbered 0065: 0061-0063 belong to unmerged branches (feat/framework-in-
-- assistant, feat/business-profile) and 0064 to feat/beta-invites.
--
-- Cairn converts the reader's money from USD to their display currency. Today's
-- rate comes from the ECB's daily file (src/lib/market-data/fx.ts) and was
-- applied to the cost basis too, so a euro reader's gain left out the euro's
-- move since they bought. Converting the cost at the purchase-date rate needs
-- the history, which until now Cairn did not keep.
--
-- Same source as today's rate - the ECB euro foreign exchange reference rates -
-- stored as the ECB publishes them: units of each currency per 1 EUR, one row
-- per publication date and currency. Only the currencies Settings offers are
-- kept (USD is the cross leg and always present). No new provider.
--
-- This is public reference data, not user data: any signed-in user may read it,
-- nobody but the service role writes it (scripts/backfill-fx-rates.ts, and the
-- same upsert from the daily job). No row here is about a person.

create table if not exists public.fx_rates_daily (
  date          date    not null,
  currency      text    not null check (currency ~ '^[A-Z]{3}$'),
  -- Units of `currency` per 1 EUR, as published. EUR itself is not stored (it is 1).
  rate_per_eur  numeric not null check (rate_per_eur > 0),
  primary key (date, currency)
);

comment on table public.fx_rates_daily is
  'ECB euro foreign exchange reference rates, one row per publication date and currency (units per 1 EUR). Public reference data; written only by the service role.';

alter table public.fx_rates_daily enable row level security;

drop policy if exists "fx_rates_daily readable by signed-in users" on public.fx_rates_daily;
create policy "fx_rates_daily readable by signed-in users"
  on public.fx_rates_daily for select to authenticated using (true);

-- No insert/update/delete policy: with RLS on, that means no one but the
-- service role (which bypasses RLS) can write.

-- USD -> p_currency, by ECB publication date, as one jsonb array of
-- ["YYYY-MM-DD", rate] pairs in date order.
--
-- One call per portfolio load, and one value rather than one row per day: a
-- result set is capped at 1000 rows by the API (the 2026-09-26 price-history
-- truncation), and "since the first purchase" is more than that. Starts at the
-- last publication on or before p_from, so a purchase date that falls on a
-- weekend still finds the Friday rate before it.
--
-- The cross rate is (currency per EUR) / (USD per EUR), the same arithmetic as
-- usdCrossRate() in src/lib/market-data/fx.ts. EUR is the ECB's base, so its
-- leg is 1.
create or replace function public.fx_usd_cross_series(p_currency text, p_from date)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with start as (
    select coalesce(max(date), p_from) as d
    from fx_rates_daily
    where currency = 'USD' and date <= p_from
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_array(u.date, round(coalesce(x.rate_per_eur, 1) / u.rate_per_eur, 8))
      order by u.date
    ),
    '[]'::jsonb
  )
  from fx_rates_daily u
  left join fx_rates_daily x on x.date = u.date and x.currency = p_currency
  where u.currency = 'USD'
    and u.date >= (select d from start)
    and (p_currency = 'EUR' or x.rate_per_eur is not null)
$$;

comment on function public.fx_usd_cross_series(text, date) is
  'USD -> p_currency from the ECB daily rates, as a jsonb array of [date, rate] pairs in date order, starting at the last publication on or before p_from.';

grant execute on function public.fx_usd_cross_series(text, date) to authenticated;
