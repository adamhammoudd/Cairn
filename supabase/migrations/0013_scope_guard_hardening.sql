-- Hardens the scope-guard audit trail for the chat surface, which previously
-- ran the guard post-hoc (after the response was already streamed to the
-- user and persisted) and never rewrote a flagged output — only logged it.
-- See lib/ai/chat-generate.ts: chat now buffers, validates, and rewrites
-- before anything reaches the client or chat_messages, matching generate.ts's
-- existing pre-storage gate for the analysis-generation path.

alter table ai_scope_guard_log add column if not exists corrected_output text;

alter table ai_scope_guard_log add column if not exists source_surface text
  not null default 'analysis' check (source_surface in ('analysis', 'chat'));
-- Existing rows all came from generate.ts (the analysis path) prior to this
-- migration, so the 'analysis' default is also the correct backfill value —
-- no separate UPDATE needed.
