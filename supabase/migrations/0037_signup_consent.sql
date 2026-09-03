-- Signup consent record (feature: Terms & Privacy consent on signup).
--
-- The signup form now carries a required "I agree to the Terms of Service and
-- Privacy Policy" checkbox, and the submit button stays disabled until it is
-- ticked. That is the UI gate; this table is the compliance RECORD: one row
-- per consent event, capturing WHEN a user agreed and WHICH revision of each
-- document they agreed to (src/lib/legal-versions.ts).
--
-- Append-only. If either document changes materially and existing users are
-- re-prompted later, that is a NEW row, never an update - so the history of
-- what each account actually agreed to, and when, stays intact.
--
-- Written by the signup server action (src/lib/actions/auth.ts) through the
-- service-role client, so a user cannot forge or delete their own consent
-- record - the same posture as ai_usage_events / subscription_events. The
-- consent is also mirrored into auth.users.raw_user_meta_data at signup as a
-- backstop in case this insert fails.

create table if not exists public.user_consents (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  consented_at    timestamptz not null default now(),
  tos_version     text not null,
  privacy_version text not null,
  ip              inet,
  user_agent      text,
  created_at      timestamptz not null default now()
);

create index if not exists user_consents_user_id_idx
  on public.user_consents (user_id, consented_at desc);

alter table public.user_consents enable row level security;

-- A user may read their own consent history (Settings can surface it later).
drop policy if exists "own consents are readable" on public.user_consents;
create policy "own consents are readable"
  on public.user_consents for select
  using (auth.uid() = user_id);

-- No insert/update/delete policy on purpose: writes are service-role only.
