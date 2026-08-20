# Supabase setup

## 1. Schema

Run against your project's SQL editor (or `psql`), in order:

1. `schema.sql` — full table set + RLS policies + `handle_new_user` trigger
2. `seed/providers.sql` — example news/market-data/filings providers (edit
   weights, enable/disable, or add rows directly in `data_providers` — no
   code deploy needed for that part)
3. `migrations/0002_schedule_ingestion.sql` — pg_cron schedule for the two
   ingestion Edge Functions. The function URLs are written out with this
   project's real ref; forking to another Supabase project means replacing
   `vvferejzawkhzlmvvaog` throughout `migrations/`. Set
   `app.settings.service_role_key` first, see comment in the file.
4. Remaining numbered migrations in order, including `0013_scope_guard_hardening.sql`
   (adds `ai_scope_guard_log.corrected_output`/`source_surface`, needed by the
   restructured chat scope-guard in `lib/ai/chat-generate.ts`) and
   `0014_chat_usage_gate.sql` (adds `chat_usage_events`, needed by the chat
   daily-message cap in `lib/actions/billing.ts`). Re-run `seed/providers.sql`
   too — it now also seeds the CoinGecko provider row `ingest-crypto` reads
   from instead of a hardcoded URL.

## 2. Edge Functions

```
supabase functions deploy ingest-news --no-verify-jwt
supabase functions deploy ingest-market-data --no-verify-jwt
supabase functions deploy ingest-fundamentals --no-verify-jwt
supabase functions deploy ingest-calendar --no-verify-jwt
supabase functions deploy generate-daily-briefings --no-verify-jwt
supabase functions deploy evaluate-alerts --no-verify-jwt
```

`--no-verify-jwt` lets pg_cron invoke these without presenting a secret — the
functions still use their own env-injected service-role key internally.

Test either one manually before relying on the cron schedule:

```
supabase functions invoke ingest-news
supabase functions invoke ingest-market-data
```

Each returns a per-provider `{ fetched, inserted }` (or `error`) summary.

## 2a. What each function ingests

| Function | Source | Keyless? | Writes |
|---|---|---|---|
| `ingest-news` | RSS feeds, SEC EDGAR full-text | yes | `news_items` |
| `ingest-market-data` | Yahoo Finance chart API | yes | `historical_prices` |
| `ingest-fundamentals` | SEC EDGAR XBRL `companyconcept` | yes (User-Agent required) | `fundamentals` |
| `ingest-calendar` | Nasdaq public calendar API | yes (browser User-Agent required) | `calendar_events` |
| `generate-daily-briefings` | internal (no external call) | — | `daily_briefings` |
| `evaluate-alerts` | internal (no external call) | — | `alert_deliveries`, `alerts.last_triggered_at` |

Two caveats worth knowing before relying on these:

- **`ingest-fundamentals`** stores only raw reported figures (shares outstanding,
  TTM EPS, TTM dividends). Market cap, P/E, and dividend yield are derived at
  query time against the latest close so they can't go stale as prices move.
  ETFs and funds don't file those XBRL concepts, so they get no row and are
  excluded by those screener filters rather than given fabricated values.
- **`evaluate-alerts`** evaluates against daily OHLCV bars, so it's scheduled
  around the market-data ingest rather than continuously — running more often
  would re-read the same bar. Only `in_app` deliveries actually reach the user;
  `push` and `email` rows are written with status `unconfigured` because no
  provider is wired. Its condition logic is duplicated from `src/lib/alerts.ts`
  (Deno vs Node, no shared module) — change both together.
- **`ingest-calendar`** covers earnings, ex-dividend, and split dates only.
  Nasdaq's IPO endpoint returned nothing usable for a forward window, and no
  keyless economic-calendar feed was found (the Fed's `calendar.json` is a
  historical archive), so the `economic` and `ipo` event types stay empty until
  a provider is added. It also relies on an undocumented public endpoint — if it
  starts returning zero rows, check whether the response shape changed.

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
