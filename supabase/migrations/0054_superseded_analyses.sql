-- 0054: mark an analysis as superseded instead of deleting it
-- (chore/regenerate-analyses, docs/decisions/2026-09-27-analysis-rebuild.md).
--
-- scripts/regenerate-analyses.ts writes a new analysis per scope with the
-- rebuilt pipeline and points every older row at it. Old rows stay: their
-- sources, cases and text remain on record, and a chat message that cited one
-- still resolves it. Lists (Research, the ticker page, the briefing, Base Camp,
-- the assistant's context) read only rows where superseded_by is null.

alter table ai_analyses
  add column if not exists superseded_by uuid references ai_analyses (id) on delete set null,
  add column if not exists superseded_at timestamptz;

comment on column ai_analyses.superseded_by is 'The analysis that replaced this one (regenerated with a newer pipeline). Null for current analyses; readers list only those.';

create index if not exists ai_analyses_current_scope_idx
  on ai_analyses (scope_type, scope_value, created_at desc)
  where superseded_by is null and status = 'validated';
