# Migration ledger reconciliation - 2026-08-30

**Owner:** dev-lead · **Trigger:** Stage 8.2 of the 30 Aug combined-scan remediation.

## The discrepancy

`supabase_migrations.schema_migrations` on the live project (`vvferejzawkhzlmvvaog`)
had drifted from `supabase/migrations/*.sql` in two ways:

1. **Version strings do not match filenames.** The repo names migrations
   `NNNN_slug.sql`. The ledger uses a mix: `0002`/`0003` for the first two, then
   `supabase`-style UTC timestamps (`20260810101022`) for most, and only the
   `0016`–`0018` batch carries the `NNNN_slug` string - in the `name` column,
   never the `version` column. This means `supabase db push` was **not** the tool
   that applied most of these; they were run by hand (SQL editor / MCP) and the
   ledger row inserted separately, or not at all.

2. **0027–0032 were missing entirely.** Their SQL had been applied to the live
   DB but no ledger row was ever written, so the ledger under-reported the
   applied schema by six migrations - the same "is this deployed?" ambiguity
   that this project has hit repeatedly.

## What was verified live before backfilling (2026-08-30)

| File | Objects checked in the live DB | Present |
|---|---|---|
| `0027_on_demand_ingestion` | `symbol_directory` table, `recent_prices(text[],int)`, `recent_prices_all(int,text[])` | ✅ |
| `0028_profiles_statements_moderation` | `symbol_profiles`, `financial_statements`, `discussion_reports`, `symbol_52w_range()`, `profiles.role`, `user_settings.two_factor_status` | ✅ |
| `0029_security_definer_view` | `discussion_report_counts` view has `security_invoker=true` | ✅ |
| `0030_schema_sql_drift` | `user_settings.dashboard_layout`, `watchlists.description`, `watchlists.display_prefs` | ✅ |
| `0031_settings_page` | `user_settings.briefing_hour_local`, `subscription_events`, `generate-daily-briefings` cron on `0 * * * *` | ✅ |
| `0032_cron_secret_via_vault` | every cron job sends `x-cairn-cron-secret` sourced from `vault.decrypted_secrets` | ✅ |

## What was changed in the ledger

- Inserted six rows for `0027`–`0032`, versions `20260820200001`–`20260820200006`
  (synthetic, ordered between `expand_tracked_universe` = `20260820194724` and
  `waitlist` = `20260830160536`), `name` = file basename, `statements` = a
  one-line "backfilled, effects verified live, original SQL at <path>" marker
  rather than a re-run of the DDL.
- Renamed the `waitlist` row (`20260830160536`) to `0033_waitlist` for
  filename-consistency. `0034_security_batch` (this pass, applied via
  `apply_migration`) is already recorded as `20260830210918`.

## Known remaining divergences (not touched in this pass)

- **Pre-0027 `name` values diverge from file basenames** (`phase11_goals` vs
  `0011_phase11_goals`, `rename_subscriptions_plan_to_tier` vs
  `0019_reconcile_subscriptions_tier`, etc.). Effects predate the 2026-08-20
  hardening batch and are also captured in `supabase/schema.sql`; renaming the
  rows is cosmetic and was left alone to avoid churn.
- **`0004`, `0005`, `0007`, `0010`, `0013`, `0014`, `0015`** have no obviously
  matching ledger row. Their objects (fundamentals tables, scope-guard
  hardening, chat usage gate) are present in the running DB and in
  `schema.sql`; they were most likely folded into the initial provisioning or
  an early squash. Flagged, not backfilled - needs a per-migration object
  audit, which is a separate task.
- **`0023_cron_secret_header`** is correctly absent: its own successor
  `0032_cron_secret_via_vault` documents that `0023` could never apply on hosted
  Supabase (`ALTER DATABASE ... SET` needs superuser). Do not backfill it.

## Convention going forward

- One migration file, one ledger row. `name` column = the file basename
  (`NNNN_slug`), always.
- If applied by hand (SQL editor / MCP `apply_migration`), immediately insert
  the ledger row with the real `statements`.
- Prefer `supabase db push` once the version strings are realigned; until then,
  treat `name` (not `version`) as the join key to the repo.
