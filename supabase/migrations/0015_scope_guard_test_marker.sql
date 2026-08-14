-- ai_scope_guard_log is the compliance audit trail — the table a reviewer or
-- regulator would read to see every output the guard rejected or rewrote.
-- The adversarial suite (scripts/tests/adversarial-scope-guard.ts) exercises
-- the real production path on purpose, which means it was writing synthetic
-- violations into that same table, indistinguishable from real ones.
--
-- Two problems with that: the genuine rewrite rate became unmeasurable, and
-- an auditor would see fabricated events that never involved a user. This
-- marks test-originated rows so they can be excluded from both.
--
-- Defaults to false, so every existing row is treated as real. See the note
-- in scripts/guard-stats.ts about back-marking rows written before this
-- migration if you want the historical numbers to be clean.

alter table ai_scope_guard_log add column if not exists is_test boolean not null default false;

create index if not exists ai_scope_guard_log_real_events_idx
  on ai_scope_guard_log (created_at desc) where not is_test;
