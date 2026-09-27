-- Assistant v2 (feat/assistant-v2): what each answer was built from.
--
-- chat_messages.meta holds, per assistant turn: the "Checked: ..." line, the
-- key-figure tiles, the numbered sources, the follow-up suggestions, every
-- tool call made (name, arguments, ok, time - the tool log the brief asks to
-- keep on the message), guard failures on the way, token usage and the cost of
-- the turn. Readable exactly like the message itself (existing RLS: the
-- session owner only). Null on user turns and on every message written before
-- this migration.
--
-- Additive. The route writes meta only when the column exists, so this can be
-- applied before or after the app deploy; apply it WITH the deploy so the
-- first answers keep their sources and tiles on reload.

alter table public.chat_messages add column if not exists meta jsonb;

comment on column public.chat_messages.meta is
  'Assistant v2: checked line, tiles, sources, follow-ups, tool log, guard failures, usage and cost_usd for the turn.';
