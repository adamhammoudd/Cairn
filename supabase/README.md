# Supabase setup

## 1. Schema

Run against your project's SQL editor (or `psql`), in order:

1. `schema.sql` — full table set + RLS policies + `handle_new_user` trigger
2. `seed/providers.sql` — example news/market-data/filings providers (edit
   weights, enable/disable, or add rows directly in `data_providers` — no
   code deploy needed for that part)
3. `migrations/0002_schedule_ingestion.sql` — pg_cron schedule for the two
   ingestion Edge Functions (edit the `<project-ref>` placeholder and set
   `app.settings.service_role_key` first, see comment in the file)

## 2. Edge Functions

```
supabase functions deploy ingest-news --no-verify-jwt
supabase functions deploy ingest-market-data --no-verify-jwt
```

`--no-verify-jwt` lets pg_cron invoke these without presenting a secret — the
functions still use their own env-injected service-role key internally.

Test either one manually before relying on the cron schedule:

```
supabase functions invoke ingest-news
supabase functions invoke ingest-market-data
```

Each returns a per-provider `{ fetched, inserted }` (or `error`) summary.

## 3. Adding a new source

- **Re-weighting, enabling/disabling, or pointing an existing adapter at a
  new endpoint**: edit the `data_providers` row directly. No deploy.
- **A genuinely new response shape**: add an adapter function in
  `functions/_shared/adapters.ts` (news/filings) or
  `functions/_shared/market-adapters.ts` (OHLCV), then reference it by name
  in the provider's `config.adapter`. Requires deploying the function.

## 4. NewsAPI.org

The seeded NewsAPI.org row is `enabled: false` with an empty `api_key` — get
a free key at newsapi.org, set `config.api_key`, and flip `enabled` to
`true` to turn it on. The RSS and SEC EDGAR sources need no key.
