-- Factor-derived analogs (methodology rebuild: any-ticker analysis).
--
-- Until now an analysis needed rows in historical_events, which only the
-- scheduled Edge Functions write, and only for the symbols they iterate. A
-- symbol nobody had tracked could never be analysed however much price history
-- it had. The analysis engine now derives analogs from a symbol's own price
-- history (lib/ai/factors.ts): days on which its factor state matched today's,
-- and what the price did over the next 10 sessions.
--
-- Two additions:
--
-- 1. 'factor_signal' as a historical_events.event_type. A factor instance is a
--    plain fact about a date - close on that date, close 10 sessions later - so
--    it is stored as an ordinary event row and reaches users through the SAME
--    ai_analysis_historical_analogs join every other analog uses. Nothing
--    downstream (attachMethodology, MethodologyCard) needs to know the
--    difference. Which conditions matched lives on the analog link's `note`,
--    not on the event, so the row is identical whichever analysis cites it and
--    the existing (symbol, event_type, event_date) unique index makes re-runs
--    idempotent.
--
-- 2. ai_analysis_factors: the factor readings behind an analysis, one row per
--    factor, following the ai_analysis_sources / _historical_analogs
--    convention (child table, cascade delete, readable only via a validated
--    parent).

alter table public.historical_events drop constraint if exists historical_events_event_type_check;
alter table public.historical_events
  add constraint historical_events_event_type_check
  check (event_type in ('earnings','split','dividend','macro','ipo','guidance','volatility_regime','factor_signal'));

create table if not exists public.ai_analysis_factors (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.ai_analyses(id) on delete cascade,
  factor_key text not null,
  value numeric,
  -- Where `value` sits in the symbol's own history, 0-100.
  percentile numeric check (percentile is null or (percentile >= 0 and percentile <= 100)),
  -- Categorical state used for analog matching (null when neutral).
  state text,
  detail jsonb not null default '{}'::jsonb,
  unique (analysis_id, factor_key)
);

create index if not exists ai_analysis_factors_analysis_idx on public.ai_analysis_factors (analysis_id);

alter table public.ai_analysis_factors enable row level security;

drop policy if exists "public read validated" on public.ai_analysis_factors;
create policy "public read validated" on public.ai_analysis_factors
  for select
  using (
    exists (
      select 1 from public.ai_analyses a
      where a.id = ai_analysis_factors.analysis_id
        and a.status = 'validated'
    )
  );

-- Writes happen only through the service role (generateAnalysis), which
-- bypasses RLS; no insert/update/delete policy is granted to anyone else.
revoke insert, update, delete on public.ai_analysis_factors from anon, authenticated;
