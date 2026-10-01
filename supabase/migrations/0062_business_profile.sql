-- 0062: "What it does" and revenue by segment (feat/business-profile)
--
-- Two tables, both filled by the ingest-business-profile Edge Function from a
-- company's latest 10-K on SEC EDGAR (keyless, public):
--
--   company_profiles - one row per company: SIC code and description, the
--     10-K it was read from, the opening of its "Item 1. Business" section
--     (the source text), whether its revenue split adds up, and the
--     plain-English description the app writes from that excerpt (cached per
--     filing: plain_accn says which 10-K it was written from, so a new 10-K
--     means a new description, and a page view never regenerates one).
--
--   company_segments - revenue per business segment and per product line for
--     the 10-K's fiscal year, from the filing's own XBRL instance (SEC's
--     companyfacts API has no segment data). Only splits that add up to the
--     reported total within 1% are stored; parsing rules are in
--     supabase/functions/_shared/sec-segments.ts.
--
-- Public SEC data: readable by everyone, written only by the service role
-- (the Edge Function, and the app server caching a description).

create table if not exists company_profiles (
  symbol text primary key,
  cik text not null,
  name text,
  sic text,
  sic_description text,
  accn text not null,
  form text not null default '10-K',
  filed date,
  fiscal_year_end date,
  source_url text not null,
  business_excerpt text,
  segment_status text not null default 'none' check (segment_status in ('split', 'single_segment', 'none')),
  segment_reason text,
  plain_one_liner text,
  plain_paragraph text,
  plain_source text check (plain_source in ('model', 'template')),
  plain_failure text,
  plain_accn text,
  plain_generated_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists company_segments (
  id bigserial primary key,
  symbol text not null,
  fiscal_year_end date not null,
  axis text not null check (axis in ('business_segment', 'product_or_service')),
  member text not null,
  label text not null,
  revenue numeric not null,
  total numeric not null,
  concept text not null,
  accn text not null,
  filed date,
  updated_at timestamptz not null default now(),
  unique (symbol, fiscal_year_end, axis, member)
);
create index if not exists company_segments_symbol_idx on company_segments (symbol, fiscal_year_end desc);

alter table company_profiles enable row level security;
alter table company_segments enable row level security;

drop policy if exists "public read" on company_profiles;
create policy "public read" on company_profiles for select using (true);
drop policy if exists "public read" on company_segments;
create policy "public read" on company_segments for select using (true);

grant select on company_profiles, company_segments to anon, authenticated;
grant all on company_profiles, company_segments to service_role;
grant usage, select on sequence company_segments_id_seq to service_role;
