-- 0055: allow the base-rate windows in historical_events.
--
-- feat/analysis-baseline (#164) stores "price_window" rows (the base rate for a
-- day when nothing about a symbol is unusual; lib/ai/factor-analysis.ts
-- BASELINE_EVENT_TYPE). The event_type check constraint, last rewritten in
-- 0046, did not list it, so every ticker analysis on an ordinary day failed:
--   new row for relation "historical_events" violates check constraint
--   "historical_events_event_type_check"
--
-- Same list as 0046 (checked against the live constraint on 2026-09-27) plus
-- 'price_window'. Loosening only: no existing row is affected.
-- scripts/tests/event-type-constraint.ts keeps code and constraint in step.

alter table public.historical_events drop constraint if exists historical_events_event_type_check;
alter table public.historical_events
  add constraint historical_events_event_type_check
  check (event_type in ('earnings','split','dividend','macro','ipo','guidance','volatility_regime','factor_signal','price_window'));
