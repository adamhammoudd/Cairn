-- Fixes item 7 of docs/audits/2026-09-05-fix-sweep.md: one Research-page
-- card's subtype label reads the generic "Ticker" instead of a real
-- analysis type, e.g. "Elevated Move Likelihood" like every sibling card.
--
-- Root cause: this is a data bug, not a rendering one - the label is just
-- `analysis_type.replace(/_/g, " ")` (research-workspace.tsx), and this one
-- row's stored `analysis_type` is literally the string "ticker" (matching
-- its own `scope_type`, not a real category) while every other row has a
-- real snake_case label like "elevated_move_likelihood". The model likely
-- echoed scope_type back into the analysis_type field for this one
-- generation instead of producing a real category.
--
-- Confirmed by reading the row's own reasoning_text, which explicitly
-- discusses "the chance of an 'elevated move' (defined as a change of 5% or
-- more...)" - the exact definition every other elevated_move_likelihood row
-- uses - so this corrects it to the category its own content already
-- describes, not a guess.

update ai_analyses
set analysis_type = 'elevated_move_likelihood'
where id = '886330a8-11f0-4278-8ec0-939629e1f362'
  and analysis_type = 'ticker';
