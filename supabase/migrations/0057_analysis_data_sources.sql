-- 0057: an analysis can cite its data, not only news articles.
--
-- fix/analysis-sources. The guardrail is "every analysis shows its sources",
-- and ai_analysis_sources could only point at a news_items row - so a share
-- with five years of prices, SEC filings and a results date on file, but no
-- news item tagged with its ticker (Micron, 2026-09-27), could not be analysed
-- at all. Each row here is one data source an analysis was computed from, built
-- in code from rows that were actually read (lib/ai/data-sources.ts):
--
--   sec_filing    the SEC filing a figure came from: accession number, form,
--                 filing date, and its EDGAR folder URL
--   price_data    the daily price history: provider, first and last date
--   calendar      a dated event the analysis names (results, dividend)
--   fund_profile  a fund's name as listed (issuer and strategy)
--   coin_profile  a coin's market data (CoinGecko), with its as-of date
--
-- Service-role only, like ai_analyses since 0053: the app reads it on the
-- server (lib/actions/analysis.ts attachMethodology). RLS on, no policy, no grant.
--
-- Additive: no existing row or reader is affected. Apply BEFORE the app code
-- that writes it is deployed - that code stores these rows with every ticker
-- analysis and refuses to publish an analysis whose evidence did not store.

create table if not exists public.ai_analysis_data_sources (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.ai_analyses (id) on delete cascade,
  kind text not null check (kind in ('sec_filing', 'price_data', 'calendar', 'fund_profile', 'coin_profile')),
  label text not null,
  reference text not null,
  as_of date,
  url text,
  created_at timestamptz not null default now()
);

create index if not exists ai_analysis_data_sources_analysis_id_idx on public.ai_analysis_data_sources (analysis_id);

alter table public.ai_analysis_data_sources enable row level security;
revoke all on public.ai_analysis_data_sources from anon, authenticated;
