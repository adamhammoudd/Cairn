-- Cairn: full Supabase schema (all phases). Confirm before Phase 1 code gen.
-- Postgres + Supabase auth.users as identity root. RLS enabled every user-scoped table.

create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- ============================================================
-- PHASE 1: profiles, settings
-- ============================================================

create table profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  default_chart_view text not null default '1D' check (default_chart_view in ('1D','1W','1M','3M','1Y','ALL')),
  refresh_rate_seconds int not null default 30,
  currency text not null default 'USD',
  metric_style text not null default 'percent' check (metric_style in ('percent','absolute')),
  compact_mode boolean not null default false,
  extended_hours boolean not null default false,
  notification_thresholds jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- PHASE 2: provider config, news, historical trend store
-- ============================================================

create table data_providers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  provider_type text not null check (provider_type in ('news','market_data','filings')),
  endpoint text not null,
  weight numeric not null default 1.0,
  priority int not null default 100,
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table news_items (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid references data_providers(id),
  external_id text,
  title text not null,
  body text,
  url text,
  source_name text not null,
  published_at timestamptz not null,
  ingested_at timestamptz not null default now(),
  tickers text[] not null default '{}',
  sectors text[] not null default '{}',
  sentiment_score numeric,
  reliability_weight numeric not null default 1.0,
  dedup_hash text not null,
  unique (dedup_hash)
);
create index on news_items using gin (tickers);
create index on news_items using gin (sectors);
create index on news_items (published_at desc);

create table historical_prices (
  id bigserial primary key,
  symbol text not null,
  asset_type text not null check (asset_type in ('equity','etf','crypto','forex','future')),
  ts date not null,
  open numeric, high numeric, low numeric, close numeric, volume bigint,
  unique (symbol, ts)
);
create index on historical_prices (symbol, ts desc);

-- Fundamentals from SEC EDGAR XBRL. Raw reported figures only — market cap,
-- P/E, and dividend yield are derived at query time against historical_prices
-- so they don't go stale as prices move.
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

create table historical_events (
  id uuid primary key default gen_random_uuid(),
  symbol text,
  sector text,
  event_type text not null check (event_type in ('earnings','split','dividend','macro','ipo','guidance')),
  event_date date not null,
  description text,
  price_before numeric,
  price_after numeric,
  volume_at_event bigint,
  metadata jsonb not null default '{}'::jsonb
);
create index on historical_events (symbol, event_date desc);
create index on historical_events (sector, event_date desc);

-- ============================================================
-- PHASE 3: portfolio holdings
-- ============================================================

create table holdings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  asset_type text not null default 'equity',
  quantity numeric not null,
  purchase_price numeric not null,
  purchase_date date not null,
  sector text,
  asset_class text,
  geography text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on holdings (user_id);

-- ============================================================
-- PHASE 4: AI analysis engine (core product)
-- ============================================================

create table ai_analyses (
  id uuid primary key default gen_random_uuid(),
  scope_type text not null check (scope_type in ('market','sector','ticker')),
  scope_value text not null,          -- e.g. 'semiconductors', 'AAPL', 'broad_market'
  analysis_type text not null,        -- e.g. 'volatility_likelihood', 'post_earnings_pattern'
  probability_low numeric not null,
  probability_high numeric not null,
  confidence_level text not null check (confidence_level in ('low','medium','high')),
  sample_size int not null,           -- count of historical analogs used
  reasoning_text text not null,       -- plain-language explanation, required
  model_version text not null,
  status text not null default 'validated' check (status in ('validated','rejected','pending_review')),
  created_at timestamptz not null default now()
);
create index on ai_analyses (scope_type, scope_value, created_at desc);

create table ai_analysis_sources (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references ai_analyses(id) on delete cascade,
  news_item_id uuid not null references news_items(id),
  weight numeric not null default 1.0
);

create table ai_analysis_historical_analogs (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references ai_analyses(id) on delete cascade,
  historical_event_id uuid not null references historical_events(id),
  similarity_score numeric not null,
  note text
);

-- scope-guard: every rejected/flagged generation logged here, never exposed to user
create table ai_scope_guard_log (
  id uuid primary key default gen_random_uuid(),
  raw_output text not null,
  flagged boolean not null,
  flag_reason text,        -- e.g. 'personal_directive_detected'
  linked_analysis_id uuid references ai_analyses(id),
  created_at timestamptz not null default now()
);

-- ============================================================
-- PHASE 5: chat, briefings
-- ============================================================

create table chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  created_at timestamptz not null default now()
);

create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references chat_sessions(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  referenced_analysis_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);
create index on chat_messages (session_id, created_at);

create table daily_briefings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  briefing_date date not null,
  content jsonb not null,   -- structured: relevant analyses, calendar events, summary
  created_at timestamptz not null default now(),
  unique (user_id, briefing_date)
);

-- ============================================================
-- PHASE 7: screeners, watchlists, calendar
-- ============================================================

create table watchlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  display_prefs jsonb not null default '{}'::jsonb,
  sort_order int not null default 0
);

create table watchlist_items (
  id uuid primary key default gen_random_uuid(),
  watchlist_id uuid not null references watchlists(id) on delete cascade,
  symbol text not null,
  sort_order int not null default 0,
  added_at timestamptz not null default now()
);

create table saved_screens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  filters jsonb not null,
  created_at timestamptz not null default now()
);

create table calendar_events (
  id uuid primary key default gen_random_uuid(),
  symbol text,
  event_type text not null check (event_type in ('earnings','economic','dividend','ipo','split')),
  event_date date not null,
  title text not null,
  metadata jsonb not null default '{}'::jsonb
);
create index on calendar_events (event_date);

-- ============================================================
-- PHASE 8: alerts
-- ============================================================

create table alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  alert_type text not null check (alert_type in ('price','pct_change','volume_spike','technical_crossover','ai_confidence')),
  scope_value text not null,          -- symbol or sector/ticker for ai_confidence type
  condition jsonb not null,
  cooldown_seconds int not null default 3600,
  last_triggered_at timestamptz,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table alert_deliveries (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null references alerts(id) on delete cascade,
  channel text not null check (channel in ('in_app','push','email')),
  sent_at timestamptz not null default now(),
  status text not null default 'sent'
);

-- ============================================================
-- PHASE 10: discussion, ESG
-- ============================================================

create table discussion_threads (
  id uuid primary key default gen_random_uuid(),
  symbol text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  parent_id uuid references discussion_threads(id),
  body text not null,
  upvotes int not null default 0,
  downvotes int not null default 0,
  flagged boolean not null default false,
  created_at timestamptz not null default now()
);
create index on discussion_threads (symbol, created_at desc);

create table esg_scores (
  id uuid primary key default gen_random_uuid(),
  symbol text not null,
  environmental numeric,
  social numeric,
  governance numeric,
  total numeric,
  source text not null,
  as_of_date date not null,
  unique (symbol, source, as_of_date)
);

-- ============================================================
-- PHASE 12: subscriptions
-- ============================================================

create table subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free','premium')),
  stripe_customer_id text,
  stripe_subscription_id text,
  status text not null default 'active' check (status in ('active','past_due','canceled','incomplete')),
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- RLS: enable + owner-scoped policies on every user-owned table
-- ============================================================

alter table profiles enable row level security;
alter table user_settings enable row level security;
alter table holdings enable row level security;
alter table chat_sessions enable row level security;
alter table chat_messages enable row level security;
alter table daily_briefings enable row level security;
alter table watchlists enable row level security;
alter table watchlist_items enable row level security;
alter table saved_screens enable row level security;
alter table alerts enable row level security;
alter table alert_deliveries enable row level security;
alter table discussion_threads enable row level security;
alter table subscriptions enable row level security;

create policy "own row" on profiles for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own row" on user_settings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own row" on holdings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own row" on chat_sessions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own row" on chat_messages for all using (
  exists (select 1 from chat_sessions s where s.id = session_id and s.user_id = auth.uid())
);
create policy "own row" on daily_briefings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own row" on watchlists for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own row" on watchlist_items for all using (
  exists (select 1 from watchlists w where w.id = watchlist_id and w.user_id = auth.uid())
);
create policy "own row" on saved_screens for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own row" on alerts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own row" on alert_deliveries for all using (
  exists (select 1 from alerts a where a.id = alert_id and a.user_id = auth.uid())
);
create policy "own row" on subscriptions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- discussion: read all, write own
create policy "read all" on discussion_threads for select using (true);
create policy "write own" on discussion_threads for insert with check (auth.uid() = user_id);
create policy "update own" on discussion_threads for update using (auth.uid() = user_id);

-- market/news/analysis tables: public read, no user-scoping (service-role writes only via edge functions)
alter table news_items enable row level security;
alter table historical_prices enable row level security;
alter table fundamentals enable row level security;
alter table historical_events enable row level security;
alter table ai_analyses enable row level security;
alter table ai_analysis_sources enable row level security;
alter table ai_analysis_historical_analogs enable row level security;
alter table data_providers enable row level security;
alter table calendar_events enable row level security;
alter table esg_scores enable row level security;

create policy "public read" on news_items for select using (true);
create policy "public read" on historical_prices for select using (true);
create policy "public read" on fundamentals for select using (true);
create policy "public read" on historical_events for select using (true);
create policy "public read" on ai_analyses for select using (status = 'validated');
create policy "public read" on ai_analysis_sources for select using (true);
create policy "public read" on ai_analysis_historical_analogs for select using (true);
create policy "public read" on data_providers for select using (true);
create policy "public read" on calendar_events for select using (true);
create policy "public read" on esg_scores for select using (true);

-- ai_scope_guard_log: service-role only, no public policy (RLS default-deny)
alter table ai_scope_guard_log enable row level security;

-- ============================================================
-- Auto-provision profile + default settings row on signup
-- ============================================================

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, new.raw_user_meta_data->>'display_name');

  insert into public.user_settings (user_id)
  values (new.id);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
