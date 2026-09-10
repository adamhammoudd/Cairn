# Backlog

Replaces `feedback.txt`, which was an untracked text file in the repo root that
open work quietly accumulated in. Everything below is either verified open or
verified closed with the evidence that settled it.

**This is an interim home, not a decision.** Cairn should have a real tracked
backlog (issues, a board - chief-of-staff's call). Flagged there on
2026-08-29; until that exists, open work goes here rather than back into a
loose text file.

Status as of the 2026-08-30 combined-scan remediation pass (supersedes the
2026-08-29 verification pass below it).

## Blocking - real users are affected

| # | Item | Evidence |
|---|---|---|
| B4 | **Groq's free tier caps the whole product at ~200,000 tokens/day, per organisation.** A real chat turn carries news + analysis context (~3,000 tokens), so the ceiling is roughly 60–100 turns/day across all users, plus an 8,000 tokens/minute wall. The provider decision is right; the tier is not. Needs a paid Groq tier - or a working fallback endpoint (see Stage 2 / `docs/decisions/2026-08-30-groq-fallback-endpoint.md`) - before the assistant is offered to anyone. **Founder action: Groq console.** | `429 ... on tokens per day (TPD): Limit 200000` across repeated attempts; 24h rolling window |
| B5 | **`test:scope-guard` Tier B cannot pass on the current tier.** 22 context-heavy chat turns back-to-back against an 8,000 TPM limit all fail on 429, not on guard behaviour. Pace it or gate it on a paid key. | 21 of 22: `runChatTurn threw: ... HTTP 429` |

## Open - verified gaps, not yet blocking

| # | Item | Notes |
|---|---|---|
| O3 | No intraday data exists, and `historical_prices.ts` is a `date` column, so the schema cannot store it. 1D and 1W-hourly chart detail cannot be real without a schema change plus an intraday feed. **Needs an explicit in-scope / deferred decision.** | `cannot cast type date to time` |
| O4 | 3 residual scope-guard over-fires out of 42 replayed production flags (~7%). Genuine refusals still caught on "I would need to surface analyses from your Research page" phrasing. | `npx tsx scripts/replay-guard-log.ts` |
| O5 | `@vercel/analytics` is a dependency but imported nowhere. Wire it up or remove it. Note it would send data to a third party - see `docs/legal/privacy-policy.md`. | `package.json` |
| O6 | `public/robots.txt` serves and says `Disallow: /`. Correct while unlaunched; must change at launch. | HTTP 200 |
| O7 | CSP is still `Report-Only`. Needs one pass against the live deployment URL with the console open, then flip the header and restore `upgrade-insecure-requests`. **Blocked on the Vercel URL (founder).** | `next.config.ts` |
| O9 | Supabase leaked-password protection is disabled. **Founder action: Supabase Auth settings.** | Supabase security advisor |

## Closed by the 2026-08-30 combined-scan remediation pass

| Item | Evidence |
|---|---|
| B1 - `0031_settings_page` not applied to production | verified live 2026-08-30: `user_settings.briefing_hour_local` present, `subscription_events` present, briefing cron on `0 * * * *`. Ledger row backfilled - see `docs/migrations-ledger-reconciliation-2026-08-30.md` |
| B2 - `ingest-historical-events` / `ingest-crypto` not deployed | both redeployed 2026-08-30 (v4 / v7); cron returns 200 with real work in `net._http_response` |
| B3 - dead cron job `invoke-edge-function` (jobid 24) | no longer present in `cron.job` |
| O1 - on-demand symbols ingested once, never refreshed | `ingest-market-data` v4 now has a second pass over `symbol_directory` (`last_requested_at` window, stalest-first). Authed run 2026-08-30 refreshed ISRG, AMD, PLTR, NFLX, UBER, COIN… |
| O2 - SPY stale despite being in provider config | root cause was object-form `{symbol,asset_type}` entries hitting `symbols as string[]`. `ingest-market-data` v4 parses both forms; authed run wrote `SPY` as `asset_type=etf`, latest bar 2026-08-28. Same bug fixed in `ingest-calendar` / `ingest-fundamentals` (they 500'd on it). |
| O8 - `public.is_admin(uid)` executable by `anon` | `REVOKE EXECUTE` from public/anon/authenticated (migration `0034_security_batch`); ACL now `{postgres, service_role}`; advisor cleared |
| Privacy page still claimed "no third-party AI provider / own infrastructure" | corrected in `src/app/privacy/page.tsx` + `docs/legal/privacy-policy.md` §6 |
| `pg_net` installed in `public` schema | relocated to `extensions`; advisor cleared |
| `ai_analysis_sources` / `ai_analysis_historical_analogs` world-readable (`USING true`) | policy now EXISTS-gates on `ai_analyses.status = 'validated'`; verified a rejected parent hides its children from `anon` |
| `/api/v1/holdings` + `/api/v1/watchlists` leaked raw Postgres errors | generic client message, real error logged server-side |
| `DataUnavailable` panel showed migration names + "apply this migration" text to any user | gated on `NODE_ENV !== 'production'` |
| Test account `readiness-audit-2026-08-25@cairn-test.local` + test symbols `NOTATICKER`/`ZZZZQQ` | deleted; cascade verified (0 orphan rows) |

## Closed by the 2026-08-29 pass

| Item | Evidence |
|---|---|
| Model provider contradiction - config was always Groq; a stale doc caused it | `/models` 200, `chat/completions` 200 in 0.34s |
| Privacy policy falsely claimed no third-party model provider | corrected in `7f0836f` |
| Stored analyses mislabelled `self-hosted:` | now `groq:openai/gpt-oss-120b` |
| Scope guard measured at 5/25 by the original audit | probe now 59/59; 25/25 held-out |
| Guard over-firing on real refusals | 27 of 42 production flags corrected |
| Lint reporting 12,471 problems | now 4 → 0, config fixed |
| `robots.txt` not served | moved to `public/`, HTTP 404 → 200 |
| README was the create-next-app boilerplate | replaced |

## Closed - carried over from `feedback.txt`

Every item in that file was verified implemented in code during this pass.
Retained here only so the trail is not lost.

| Original note | Where it lives |
|---|---|
| "be able to edit alert" | `updateAlert` + `AlertForm` `alert?` prop |
| "dropdown selection with tickers that match user input" | `SymbolTypeahead`, shared by every ticker picker |
| "fix message structure and layout" (assistant) | `components/chat/chat-message.tsx` |
| "make a chat settings page, with a back button" | `app/(app)/assistant/[sessionId]/settings/page.tsx` |
| "under crypto, the ticker listing is different" | unified in `markets/ticker-list.tsx` |
| "add all tickers available" | on-demand ingestion (migration 0027) |
| "searching … single dedicated page" | `app/(app)/ticker/[symbol]` |
| "compare: fix graphs / add ticker search" | `app/(app)/comparison` |
| "sector map for all sectors" | `lib/actions/sector-map.ts` |
| "fix settings page, add more settings" | shipped in `dbb7951` - **but see B1: its migration is not applied** |
