-- 0048: quarterly company figures from SEC XBRL (feat/fundamentals-expansion)
--
-- `fundamentals` holds three point-in-time figures (shares, TTM EPS, TTM
-- dividends per share). The scorecard needs history: revenue, profit, EBITDA
-- inputs, cash flow, debt and dividends per fiscal quarter, and the dates of
-- past earnings releases. All of it comes from SEC EDGAR (keyless, public):
--   * company_financials_quarterly / _annual - the companyfacts API, parsed by
--     supabase/functions/_shared/sec-companyfacts.ts (quarter derivation rules
--     are documented there; every value carries its provenance).
--   * earnings_releases - 8-K filings with item 2.02 from the submissions API,
--     with the acceptance time that says which session first reacted.
--
-- Written only by ingest-fundamentals (service role); readable by everyone,
-- like fundamentals and financial_statements. Derived figures (TTM, margins,
-- EBITDA, free cash flow, net debt, P/E) are NOT stored: they are computed in
-- src/lib/fundamentals.ts so they cannot drift from their inputs.
--
-- ETFs, funds and crypto get no rows: they have no company filings, and the
-- app shows their company figures as "not applicable", never as zero.

create table if not exists company_financials_quarterly (
  id bigserial primary key,
  symbol text not null,
  cik text not null,
  fiscal_year int not null,
  fiscal_quarter smallint not null check (fiscal_quarter between 1 and 4),
  period_start date,
  period_end date not null,
  revenue numeric,
  net_income numeric,
  operating_income numeric,
  depreciation_amortization numeric,
  operating_cash_flow numeric,
  capex numeric,
  dividends_paid numeric,
  eps_diluted numeric,
  dividends_per_share numeric,
  cash numeric,
  long_term_debt numeric,
  long_term_debt_noncurrent numeric,
  long_term_debt_current numeric,
  debt_current numeric,
  short_term_borrowings numeric,
  -- Per field: {concept, method: reported|ytd_difference|fy_minus_q1_q3,
  -- accn, form, filed, approximate?}. How every number was obtained.
  provenance jsonb not null default '{}'::jsonb,
  currency text not null default 'USD',
  source text not null default 'sec_companyfacts',
  updated_at timestamptz not null default now(),
  unique (symbol, fiscal_year, fiscal_quarter)
);
create index if not exists company_financials_quarterly_symbol_end_idx
  on company_financials_quarterly (symbol, period_end desc);

create table if not exists company_financials_annual (
  id bigserial primary key,
  symbol text not null,
  cik text not null,
  fiscal_year int not null,
  period_start date,
  period_end date not null,
  revenue numeric,
  net_income numeric,
  operating_income numeric,
  depreciation_amortization numeric,
  operating_cash_flow numeric,
  capex numeric,
  dividends_paid numeric,
  eps_diluted numeric,
  dividends_per_share numeric,
  source text not null default 'sec_companyfacts',
  updated_at timestamptz not null default now(),
  unique (symbol, fiscal_year)
);

create table if not exists earnings_releases (
  id bigserial primary key,
  symbol text not null,
  cik text not null,
  release_date date not null,
  accepted_at timestamptz,
  timing text not null check (timing in ('before_open', 'during_session', 'after_close', 'unknown')),
  accn text not null,
  source text not null default 'sec_8k_item_2_02',
  updated_at timestamptz not null default now(),
  unique (symbol, release_date)
);
create index if not exists earnings_releases_symbol_date_idx on earnings_releases (symbol, release_date desc);

alter table company_financials_quarterly enable row level security;
alter table company_financials_annual enable row level security;
alter table earnings_releases enable row level security;

drop policy if exists "public read" on company_financials_quarterly;
create policy "public read" on company_financials_quarterly for select using (true);
drop policy if exists "public read" on company_financials_annual;
create policy "public read" on company_financials_annual for select using (true);
drop policy if exists "public read" on earnings_releases;
create policy "public read" on earnings_releases for select using (true);

grant select on company_financials_quarterly, company_financials_annual, earnings_releases to anon, authenticated;
grant all on company_financials_quarterly, company_financials_annual, earnings_releases to service_role;
grant usage, select on sequence company_financials_quarterly_id_seq, company_financials_annual_id_seq, earnings_releases_id_seq to service_role;
