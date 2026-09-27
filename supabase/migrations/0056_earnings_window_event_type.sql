-- 0056: allow the earnings-window fallback in historical_events.
--
-- fix/analysis-coverage: when today's factor state matches too few past
-- moments and results are due within the two-week horizon, the analysis
-- falls back to past results releases measured from the same point before
-- (lib/ai/similar-moments.ts earningsWindows). Each case is stored as an
-- "earnings_window" row (lib/ai/factor-analysis.ts EARNINGS_WINDOW_EVENT_TYPE)
-- so every case behind "higher in X of N" is a citable row.
--
-- Same list as 0055 (live on 2026-09-27) plus 'earnings_window'. Loosening
-- only: no existing row is affected.
-- scripts/tests/event-type-constraint.ts keeps code and constraint in step.

alter table public.historical_events drop constraint if exists historical_events_event_type_check;
alter table public.historical_events
  add constraint historical_events_event_type_check
  check (event_type in ('earnings','split','dividend','macro','ipo','guidance','volatility_regime','factor_signal','price_window','earnings_window'));
