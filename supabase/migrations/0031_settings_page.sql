-- Settings page: the columns behind the controls the page actually ships.
--
-- Every column here has a reader. Nothing is added "for the UI to bind to
-- later" - a settings row with no consumer is the exact defect this pass
-- exists to remove (refresh_rate_seconds shipped that way and was written by
-- the form and read by nothing for four phases).
--
--   sector_map_default_sector  -> src/app/(app)/sector-map/page.tsx
--   briefing_hour_local/tz     -> supabase/functions/generate-daily-briefings
--   briefing_include_holdings  -> src/lib/ai/briefing.ts + the Edge Function
--   briefing_watchlist_ids     -> ditto
--   briefing_news_categories   -> ditto
--   briefing_delivery          -> recorded preference; see the note below

alter table public.user_settings
  -- Null = "every sector", which is what the Sector map has always shown.
  add column if not exists sector_map_default_sector text,
  -- Local wall-clock hour the briefing should be generated at. The scheduler
  -- runs hourly and picks the users whose local hour matches; see
  -- 0031's cron.schedule change at the bottom of this file.
  add column if not exists briefing_hour_local smallint not null default 12,
  -- IANA zone. 'UTC' is the safe default rather than guessing from the
  -- browser: a wrong guess silently moves someone's briefing by hours.
  add column if not exists briefing_timezone text not null default 'UTC',
  add column if not exists briefing_include_holdings boolean not null default true,
  -- Empty array = every watchlist, matching the pre-settings behaviour so an
  -- existing user's briefing does not change contents on upgrade.
  add column if not exists briefing_watchlist_ids uuid[] not null default '{}',
  -- Empty array = no category filter (every story the tagger matched).
  add column if not exists briefing_news_categories text[] not null default '{}',
  -- Only 'in_app' is deliverable today. 'email'/'push' are accepted and stored
  -- so the preference survives, but the Settings UI states plainly that they
  -- are not delivered until a provider is wired - the same posture the alert
  -- channels and the two-factor panel already take.
  add column if not exists briefing_delivery text not null default 'in_app';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'user_settings_briefing_hour_local_check') then
    alter table public.user_settings
      add constraint user_settings_briefing_hour_local_check
      check (briefing_hour_local between 0 and 23);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'user_settings_briefing_delivery_check') then
    alter table public.user_settings
      add constraint user_settings_briefing_delivery_check
      check (briefing_delivery in ('in_app', 'email', 'push'));
  end if;
end $$;

comment on column public.user_settings.sector_map_default_sector is
  'Slug from src/lib/sectors.ts the Sector map opens focused on. Null = all sectors.';
comment on column public.user_settings.briefing_hour_local is
  'Local wall-clock hour (0-23) the daily briefing is generated at, resolved against briefing_timezone by the hourly scheduler.';
comment on column public.user_settings.briefing_delivery is
  'in_app is the only channel with a delivery path today. email/push are stored preferences only.';

-- Settings > Billing needs two things the schema could not answer.
--
-- 1. Renewal date. `current_period_end` exists in schema.sql but not in
--    0012_phase12_billing.sql, whose `create table if not exists` makes it a
--    no-op on a schema.sql-provisioned database and the authority on one grown
--    from migrations alone - the same split 0019 had to reconcile for `tier`.
--    Added here with `if not exists` so it is present either way. It stays
--    null until a real processor sets it, and the UI says "no renewal date"
--    rather than inventing one.
alter table public.subscriptions
  add column if not exists current_period_end timestamptz;

comment on column public.subscriptions.current_period_end is
  'End of the paid period. Null until a payment processor sets it - Settings shows "no renewal date" rather than fabricating one.';

-- 2. Payment history. There are no payments: BILLING_ENABLED is unset and
--    setTier() refuses upgrades server-side, so a "payment history" table
--    would be a table that can only ever be empty while implying otherwise.
--    What does exist, and what a reader actually needs, is the record of when
--    their plan changed and why. This logs that, and the Billing panel labels
--    it as plan history over an explicit "nothing has been charged" line.
create table if not exists public.subscription_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  from_tier text,
  to_tier text not null check (to_tier in ('free', 'premium')),
  -- 'self_serve' is the only source today. A processor webhook would write
  -- 'stripe' here, which is how the two become distinguishable in the UI
  -- without a schema change.
  source text not null default 'self_serve',
  -- Null while no processor is wired; a real charge would record its amount
  -- in minor units so the same row can render as a receipt line later.
  amount_cents integer,
  currency text,
  created_at timestamptz not null default now()
);

create index if not exists subscription_events_user_idx
  on public.subscription_events (user_id, created_at desc);

alter table public.subscription_events enable row level security;

-- Read-only to the owner. Rows are written by the server action through the
-- service-role client - a user must not be able to forge their own billing
-- record, the same posture ai_usage_events takes.
drop policy if exists "read own subscription events" on public.subscription_events;
create policy "read own subscription events" on public.subscription_events
  for select using (auth.uid() = user_id);

grant select on public.subscription_events to authenticated;
grant all on public.subscription_events to service_role;

-- The briefing scheduler moves from "12:00 UTC for everybody" to hourly, with
-- the function itself selecting the users whose local hour is the current one.
-- Without this the delivery-time setting would be a control that writes a
-- stored value and changes nothing.
--
-- Same shape as 0032_cron_secret_via_vault.sql: re-scheduling under an
-- existing jobname replaces the command in place, so this creates no
-- duplicate job and is safe to re-run. The header name is
-- x-cairn-cron-secret, matching supabase/functions/_shared/auth.ts.
--
-- Originally read the secret with current_setting('app.settings.cron_secret'),
-- which requires `alter database postgres set ...` - superuser, which hosted
-- Supabase projects do not grant
-- (ERROR: 42501: permission denied to set parameter). That RAISE firing rolled
-- back this entire script as one transaction, including the column/table DDL
-- above, which is why this migration never actually applied even though it
-- had shipped in a commit. Switched to Vault, matching 0032: the secret must
-- exist there first via
--   select vault.create_secret('<value matching Supabase secrets CRON_SECRET>', 'cron_secret', 'cron auth');
do $$
declare
  secret text;
begin
  select decrypted_secret into secret
  from vault.decrypted_secrets
  where name = 'cron_secret'
  limit 1;

  if secret is null or secret = '' then
    raise exception using
      message = 'No ''cron_secret'' entry in Vault',
      hint = 'Run: select vault.create_secret(''<random, matching Supabase secrets CRON_SECRET>'', ''cron_secret'', ''cron auth''); then re-run this migration.';
  end if;

  perform cron.schedule(
    'generate-daily-briefings',
    -- Top of every hour. The function no-ops for users whose local hour has
    -- not come round yet, and skips anyone who already has today's briefing,
    -- so this is the same amount of generation work spread across the day.
    '0 * * * *',
    $cmd$
    select net.http_post(
      url := 'https://vvferejzawkhzlmvvaog.functions.supabase.co/generate-daily-briefings',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cairn-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
      ),
      timeout_milliseconds := 120000
    );
    $cmd$
  );
end $$;
