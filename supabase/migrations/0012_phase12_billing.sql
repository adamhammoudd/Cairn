-- Phase 12: subscription tiers and AI-analysis usage gating.
--
-- No real payment processor is integrated yet (pre-launch build, per the
-- project's own stated plan: build and test first, add real billing and
-- security hardening before going live). This is the tier/limit/usage
-- scaffolding a real Stripe integration would plug into later - tier
-- changes here are self-serve and free, clearly disclosed as such in the
-- Billing UI.

create table if not exists subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tier text not null default 'free' check (tier in ('free', 'premium')),
  created_at timestamptz not null default now()
);

alter table subscriptions enable row level security;

drop policy if exists "own subscription" on subscriptions;
create policy "own subscription" on subscriptions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- One row per successful AI analysis request. Written only by the
-- service-role client from the analysis action (system-recorded usage, not
-- user-writable) - same admin-client-for-derived-data pattern as discussion
-- vote counters (see discussion.ts). Monthly usage is counted from this
-- table by calendar month, so it needs no separate period-reset job.
create table if not exists ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_events_user_idx on ai_usage_events (user_id, created_at desc);

alter table ai_usage_events enable row level security;

drop policy if exists "read own usage" on ai_usage_events;
create policy "read own usage" on ai_usage_events for select using (auth.uid() = user_id);
