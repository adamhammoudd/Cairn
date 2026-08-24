-- Two columns exist in supabase/schema.sql but were never given a migration,
-- so a project that grew by replaying the numbered migrations (this one
-- included) never received them - only a database provisioned by running
-- schema.sql fresh would have them from day one.
--
-- user_settings.dashboard_layout (commit 2f9c718, "Fix Dashboard page"):
-- added straight to schema.sql with no accompanying migration. The first
-- time anyone drags a dashboard module, updateDashboardLayout()
-- (lib/actions/dashboard.ts) fails with "Could not find the
-- 'dashboard_layout' column of 'user_settings' in the schema cache" - the
-- same class of failure as the missing 0027/0028 objects, just a column
-- instead of a table or function.
alter table user_settings
  add column if not exists dashboard_layout text[] not null default array['portfolio','markets','watchlist','news','assistant'];

-- watchlists.description / display_prefs (commit 2e5075b, "Dedicated New
-- Watchlist page..."): that commit's message says it was "applied to the
-- live Supabase project" by hand at the time, but - like dashboard_layout -
-- never got a migration file, so there is no record of it and no guarantee
-- it reached every environment this schema now runs in. `if not exists`
-- makes this a safe no-op wherever it was already applied, and a real fix
-- wherever it was not.
alter table watchlists
  add column if not exists description text;
alter table watchlists
  add column if not exists display_prefs jsonb not null default '{}'::jsonb;
