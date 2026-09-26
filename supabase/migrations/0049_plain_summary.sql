-- 0049: the plain-language summary, stored with its analysis (feat/plain-summary)
--
-- Every ticker analysis now carries a short "In plain words" summary: one
-- headline and 3-4 bullets, written by the model from the scorecard and the
-- "What history says" result only, then checked server-side (numbers, advice,
-- jargon, length; src/lib/ai/plain-summary.ts). When any check fails, the
-- stored text is the code-built template instead, and `failure` records why.
--
-- Stored rather than regenerated per view: one model call per analysis, and
-- the page shows exactly what passed the checks. The JSON also keeps the
-- scorecard and history the summary was written from, so every number in it
-- can be traced back to its inputs later.
--
-- Shape: { version, headline, bullets[], source: "model"|"template",
--          failure, evidence?, generatedAt, scorecard, history }
-- Nullable: analyses from before this migration, and sector/market scopes,
-- have none, and the page builds the template on the fly for them.

alter table ai_analyses add column if not exists plain_summary jsonb;

comment on column ai_analyses.plain_summary is
  'Plain-language summary for ticker analyses (feat/plain-summary): headline, bullets, source model|template, failure reason, and the scorecard/history inputs it was written from. Null for older analyses and non-ticker scopes.';
