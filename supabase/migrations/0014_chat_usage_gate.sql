-- Phase 5/12: chat had no usage gate at all — ai_usage_events only ever
-- counted analysis-generation requests (see lib/actions/billing.ts,
-- checkAiUsageAllowed), so Free-tier's "capped daily message count" on chat
-- was unenforced. Separate table rather than a `kind` discriminator column
-- on ai_usage_events, matching this schema's existing one-table-per-concern
-- style (ai_scope_guard_log, ai_usage_events are already split out).

create table if not exists chat_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists chat_usage_events_user_idx on chat_usage_events (user_id, created_at desc);

alter table chat_usage_events enable row level security;

drop policy if exists "read own chat usage" on chat_usage_events;
create policy "read own chat usage" on chat_usage_events for select using (auth.uid() = user_id);
