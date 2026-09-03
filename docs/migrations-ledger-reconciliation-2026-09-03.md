# Migration ledger reconciliation — 2026-09-03

**Owner:** dev-lead · **Trigger:** item 3 of the 2026-09-03 live-deployment scan
follow-up. Continues `docs/migrations-ledger-reconciliation-2026-08-30.md`.

## The discrepancy

`supabase_migrations.schema_migrations` on the live project (`vvferejzawkhzlmvvaog`)
ends at `20260830213609 / 0035_scope_guard_log_retention`. Two migration files
committed since then have been applied to the live database out of band (SQL
editor / MCP `execute_sql`) with **no ledger row**:

| File | Committed | Live objects (verified 2026-09-03) |
|---|---|---|
| `0036_email_send_log.sql` | 2026-09-02 | `public.email_send_log(day date pk, sent int default 0)`, `public.record_email_send(integer)` `SECURITY DEFINER` — both present, table has real data (16 + 1 sends) |
| `0037_signup_consent.sql` | 2026-09-03 | `public.user_consents` (8 columns, RLS on, `own consents are readable` SELECT policy), `user_consents_user_id_idx` — all present |

Each live object was diffed against its migration file: they match. This is the
same "one migration file, one ledger row" convention break the 2026-08-30
reconciliation doc's "Convention going forward" section calls out.

## The fix (backfill — NOT applied by this pass)

Per the founder's "PR-only" instruction the ledger was **not** written to during
this pass. The exact statements to run (SQL editor or MCP `execute_sql`),
matching the `name = file basename`, synthetic-`version` convention used for the
0027–0032 backfill:

```sql
insert into supabase_migrations.schema_migrations (version, name, statements) values
  ('20260902234504', '0036_email_send_log',
   array['-- backfilled 2026-09-03; effects verified live (email_send_log table + record_email_send(int)). Original SQL: supabase/migrations/0036_email_send_log.sql']),
  ('20260903093140', '0037_signup_consent',
   array['-- backfilled 2026-09-03; effects verified live (user_consents table, RLS policy, index). Original SQL: supabase/migrations/0037_signup_consent.sql']);
```

Versions are the add-commit timestamps of each file (`git log --diff-filter=A
--date=format:%Y%m%d%H%M%S`), ordered after `0035` (`20260830213609`) and
relative to each other.

## Also applied this pass

`0038_news_cron_timeout.sql` (item 8) is a **new** migration file. When applied
(via `supabase db push` or MCP `apply_migration`) it records its own ledger row
normally — no backfill needed.

## Known remaining divergences (unchanged from 2026-08-30)

- Pre-`0027` `name` values still diverge from file basenames (cosmetic).
- `0004`, `0005`, `0007`, `0010`, `0013`, `0014`, `0015` still have no matching
  ledger row — objects present in the running DB and `schema.sql`, need a
  per-migration object audit.
- `0023_cron_secret_header` is correctly absent (needs superuser; superseded by
  `0032`). Do not backfill.
- Duplicate migration number `0016` (`0016_fix_cron_project_ref.sql` +
  `0016_founder_feedback_pass2.sql`) — pre-existing, left alone.
