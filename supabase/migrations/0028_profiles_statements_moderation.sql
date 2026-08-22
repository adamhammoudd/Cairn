-- Closes the feature-completeness gaps found in the 2026-08-22 audit that
-- needed schema rather than only UI: the company-profile tab (row 14), the
-- financial-statement tabs (15), the options chain (17), manual moderation of
-- discussion comments (36), and the role gate the admin route needs (40).
--
-- Every table here is a *store*, not a source. Nothing is seeded with invented
-- figures - each is populated by an ingest path from the same provider the
-- price history comes from, and every surface reading them renders an explicit
-- "not available" state when the provider carries nothing, per the product's
-- no-placeholder-numbers rule.

-- ------------------------------------------------------------ company profile
create table if not exists symbol_profiles (
  symbol text primary key references symbol_directory (symbol) on delete cascade,
  -- Descriptive fields; all nullable because coverage differs wildly by asset
  -- type (an FX pair has no employee count, an index has no headquarters).
  long_name text,
  summary text,
  sector text,
  industry text,
  website text,
  country text,
  city text,
  employees int,
  exchange text,
  currency text,
  -- Quote-level descriptors that belong to the instrument rather than a bar.
  quote_type text,
  first_trade_date date,
  source text not null default 'yahoo_finance_quote_summary',
  as_of timestamptz not null default now()
);

alter table symbol_profiles enable row level security;
drop policy if exists "public read" on symbol_profiles;
create policy "public read" on symbol_profiles for select using (true);
grant select on symbol_profiles to anon, authenticated;
grant all on symbol_profiles to service_role;

-- ------------------------------------------------------- financial statements
-- One row per (symbol, statement, period). Line items live in JSONB because the
-- set of lines a provider returns is not fixed and a wide table would silently
-- drop anything new; the renderer walks a declared display order and shows only
-- the lines actually present.
create table if not exists financial_statements (
  id bigserial primary key,
  symbol text not null,
  statement text not null check (statement in ('income', 'balance', 'cash_flow')),
  period_type text not null check (period_type in ('annual', 'quarterly')),
  period_end date not null,
  currency text,
  line_items jsonb not null default '{}'::jsonb,
  source text not null default 'yahoo_finance_fundamentals',
  updated_at timestamptz not null default now(),
  unique (symbol, statement, period_type, period_end)
);

create index if not exists financial_statements_lookup_idx
  on financial_statements (symbol, statement, period_type, period_end desc);

alter table financial_statements enable row level security;
drop policy if exists "public read" on financial_statements;
create policy "public read" on financial_statements for select using (true);
grant select on financial_statements to anon, authenticated;
grant all on financial_statements to service_role;

-- ---------------------------------------------------------------- options
create table if not exists option_contracts (
  id bigserial primary key,
  symbol text not null,
  expiry date not null,
  option_type text not null check (option_type in ('call', 'put')),
  strike numeric not null,
  last_price numeric,
  bid numeric,
  ask numeric,
  change_pct numeric,
  volume bigint,
  open_interest bigint,
  implied_volatility numeric,
  in_the_money boolean,
  contract_symbol text,
  as_of timestamptz not null default now(),
  unique (symbol, expiry, option_type, strike)
);

create index if not exists option_contracts_chain_idx
  on option_contracts (symbol, expiry, option_type, strike);

alter table option_contracts enable row level security;
drop policy if exists "public read" on option_contracts;
create policy "public read" on option_contracts for select using (true);
grant select on option_contracts to anon, authenticated;
grant all on option_contracts to service_role;

-- ------------------------------------------------------------- moderation
-- Spam filtering (row 35) is automatic and already works. This is the *manual*
-- half: a reader can report a comment, and the report is a first-class record
-- so moderation is auditable rather than a boolean flipped from nowhere.
create table if not exists discussion_reports (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references discussion_threads (id) on delete cascade,
  reporter_id uuid not null references auth.users (id) on delete cascade,
  reason text not null check (reason in ('spam', 'abuse', 'misinformation', 'off_topic', 'other')),
  detail text,
  status text not null default 'open' check (status in ('open', 'upheld', 'dismissed')),
  resolved_by uuid references auth.users (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  -- One report per person per comment: reporting twice is not a stronger
  -- signal, and letting it be one turns the count into a vote brigade.
  unique (thread_id, reporter_id)
);

create index if not exists discussion_reports_open_idx
  on discussion_reports (status, created_at desc);

alter table discussion_reports enable row level security;

drop policy if exists "read own reports" on discussion_reports;
create policy "read own reports" on discussion_reports
  for select using (auth.uid() = reporter_id);

drop policy if exists "file own reports" on discussion_reports;
create policy "file own reports" on discussion_reports
  for insert with check (auth.uid() = reporter_id);

grant select, insert on discussion_reports to authenticated;
grant all on discussion_reports to service_role;

-- A comment that enough distinct people report is hidden pending review, the
-- same way the automatic spam filter hides one. Kept as a view so the count is
-- always derived and can never drift from the report rows.
create or replace view discussion_report_counts as
  select thread_id, count(*)::int as open_reports
  from discussion_reports
  where status = 'open'
  group by thread_id;

grant select on discussion_report_counts to anon, authenticated, service_role;

-- ------------------------------------------------------------------- roles
-- The admin route needs something to gate on. Default 'member' so an existing
-- account gains nothing by this migration; 'admin' is granted out of band.
alter table profiles add column if not exists role text not null default 'member';
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_role_check'
  ) then
    alter table profiles add constraint profiles_role_check
      check (role in ('member', 'admin'));
  end if;
end $$;

-- A member must not be able to promote themselves. The existing "own row"
-- policy is USING/WITH CHECK on auth.uid(), which would allow exactly that, so
-- role changes are taken away from the row-level grant entirely.
revoke update on profiles from authenticated;
grant update (display_name, avatar_url, updated_at) on profiles to authenticated;

-- Read-only helper so RLS elsewhere and server code share one definition of
-- "is an admin" instead of each re-deriving it.
create or replace function is_admin(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select role = 'admin' from profiles where user_id = uid), false);
$$;

grant execute on function is_admin(uuid) to authenticated, service_role;

-- Admins can see every report and resolve it.
drop policy if exists "admins read all reports" on discussion_reports;
create policy "admins read all reports" on discussion_reports
  for select using (is_admin());

drop policy if exists "admins resolve reports" on discussion_reports;
create policy "admins resolve reports" on discussion_reports
  for update using (is_admin()) with check (is_admin());

-- --------------------------------------------------------- 2FA enrolment state
-- Two-factor is not implemented; this records whether a user has asked to be
-- enrolled when it ships, so the Settings panel is an honest placeholder with
-- real state rather than a dead control.
alter table user_settings add column if not exists two_factor_status text not null default 'not_enrolled';
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_settings_two_factor_status_check'
  ) then
    alter table user_settings add constraint user_settings_two_factor_status_check
      check (two_factor_status in ('not_enrolled', 'requested'));
  end if;
end $$;

-- --------------------------------------------------- 52-week range per symbol
-- The screener's 52-week-high/low presets need one year's extreme per symbol.
-- Deriving it in the app would mean shipping a year of bars for every symbol in
-- the universe; deriving it from the 12 bars the screener already loads would
-- be a 12-day range wearing a 52-week label. Neither is acceptable, so it is an
-- aggregate at the database.
--
-- Over intraday high/low, not closes - the same convention the ticker page
-- uses, so the two surfaces cannot disagree about the same symbol's range.
create or replace function symbol_52w_range()
returns table (symbol text, week52_high numeric, week52_low numeric)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select hp.symbol,
         max(coalesce(hp.high, hp.close)) as week52_high,
         min(coalesce(hp.low, hp.close)) as week52_low
  from historical_prices hp
  where hp.ts >= (current_date - interval '365 days')
  group by hp.symbol;
$$;

grant execute on function symbol_52w_range() to anon, authenticated, service_role;
