-- 0052: the rebuilt analysis (feat/analysis-generation-v2,
-- docs/decisions/2026-09-27-analysis-rebuild.md).
--
-- A ticker analysis now leads with direction and a typical range computed in
-- code (src/lib/ai/direction.ts) and carries the model's text as structured
-- fields that passed the server-side guards (src/lib/ai/analysis-text.ts), or
-- Cairn's template when they did not.
--
-- ai_analyses is readable by any signed-in account (policy "public read",
-- validated rows), so only FREE-tier content lives on it: the counts, the
-- up-rate interval, the percentiles, worst/best, confidence, which conditions
-- were matched, and the text. The per-case rows stay on
-- ai_analysis_historical_analogs, which is service-role only since 0051;
-- `in_direction_set` marks which of them the direction was counted from.
--
-- Every new column is nullable (or defaulted), so analyses stored before this
-- migration stay readable exactly as they are.

alter table ai_analyses
  add column if not exists direction_horizon_sessions integer,
  add column if not exists direction_n integer,
  add column if not exists direction_higher integer,
  add column if not exists direction_up_low integer,
  add column if not exists direction_up_high integer,
  add column if not exists direction_confidence text,
  add column if not exists direction_p25 numeric,
  add column if not exists direction_median numeric,
  add column if not exists direction_p75 numeric,
  add column if not exists direction_worst numeric,
  add column if not exists direction_best numeric,
  add column if not exists direction_conditions jsonb,
  add column if not exists headline text,
  add column if not exists bullets jsonb,
  add column if not exists watch jsonb,
  add column if not exists sources_used uuid[],
  add column if not exists text_source text,
  add column if not exists text_failures jsonb;

alter table ai_analyses drop constraint if exists ai_analyses_direction_confidence_check;
alter table ai_analyses add constraint ai_analyses_direction_confidence_check
  check (direction_confidence is null or direction_confidence in ('low', 'medium', 'high'));

alter table ai_analyses drop constraint if exists ai_analyses_text_source_check;
alter table ai_analyses add constraint ai_analyses_text_source_check
  check (text_source is null or text_source in ('model', 'template'));

-- Counts are counts: higher can never exceed the cases counted.
alter table ai_analyses drop constraint if exists ai_analyses_direction_counts_check;
alter table ai_analyses add constraint ai_analyses_direction_counts_check
  check (direction_n is null or (direction_n >= 0 and direction_higher between 0 and direction_n));

comment on column ai_analyses.direction_n is 'Similar moments the direction was counted from (factor-derived, extra conditions applied; derived volatility regimes excluded).';
comment on column ai_analyses.direction_higher is 'Of direction_n, how many ended higher direction_horizon_sessions later. The rest were lower or unchanged.';
comment on column ai_analyses.direction_up_low is '95% Wilson interval on the up-rate, whole percent, low end.';
comment on column ai_analyses.direction_conditions is 'What the similar moments were matched on: factor states and each extra condition with applied/too_few/not_applicable and counts. No per-case data (that is Premium).';
comment on column ai_analyses.headline is 'One plain sentence. Model text that passed every guard, or the code template (see text_source).';
comment on column ai_analyses.watch is 'Array of {text, ref}; ref is event:<calendar_events.id> or source:<news_items.id>.';
comment on column ai_analyses.text_source is 'model | template. Template when the model failed a guard twice, the classifier was unavailable (strict), or the model was unreachable.';
comment on column ai_analyses.text_failures is 'Why each rejected model draft was rejected, for review. Never shown to users.';

alter table ai_analysis_historical_analogs
  add column if not exists in_direction_set boolean not null default false;

comment on column ai_analysis_historical_analogs.in_direction_set is 'True for the cases the direction and typical range were computed from.';
