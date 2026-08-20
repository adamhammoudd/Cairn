-- 0018 created the uniqueness guard on historical_events as a PARTIAL index
-- (WHERE symbol is not null). Postgres only uses a partial index as an
-- ON CONFLICT arbiter when the statement repeats the same predicate, and
-- PostgREST's on_conflict= parameter never emits one.
--
-- Consequence: every upsert from ingest-historical-events failed with
--   42P10  there is no unique or exclusion constraint matching the
--          ON CONFLICT specification
-- so the function could not have written a single row even once it was
-- deployed and authorised. This was latent behind a second failure (the
-- function was never deployed at all), which is why it went unnoticed --
-- fixing only the deploy would have produced a second silent zero-row run.
--
-- A plain unique index is equivalent here: Postgres treats NULLs as distinct
-- by default, so macro rows carrying a null symbol remain unconstrained, which
-- is the only thing the predicate was buying.
create unique index if not exists historical_events_symbol_type_date_uniq
  on public.historical_events (symbol, event_type, event_date);

comment on index public.historical_events_symbol_type_date_uniq is
  'ON CONFLICT arbiter for ingest-historical-events. Non-partial on purpose: a partial index cannot be matched by a PostgREST upsert.';
