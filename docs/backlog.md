# Backlog

Replaces `feedback.txt`, which was an untracked text file in the repo root that
open work quietly accumulated in. Everything below is either verified open or
verified closed with the evidence that settled it.

**This is an interim home, not a decision.** Cairn should have a real tracked
backlog (issues, a board — chief-of-staff's call). Flagged there on
2026-08-29; until that exists, open work goes here rather than back into a
loose text file.

Status as of the 2026-08-29 verification pass.

## Blocking — real users are affected

| # | Item | Evidence |
|---|---|---|
| B1 | **Migration `0031_settings_page.sql` was never applied to production.** All 7 `user_settings` briefing/sector columns and the `subscription_events` table are absent, while the Settings page that writes them shipped in `dbb7951`. Every briefing setting and the plan-history panel are non-functional. | `select briefing_hour_local from user_settings` → `42703: column does not exist`; `to_regclass('public.subscription_events')` → null |
| B2 | **`ingest-historical-events` and `ingest-crypto` need deploying.** The fix that gives equities volatility-regime analogs is committed but not live, so AI analysis still fails for every symbol outside the mega-cap seed set. | `67c4217`; verified against real closes — 11 of 12 sampled symbols gain analogs |
| B3 | **Delete cron job `invoke-edge-function` (jobid 24).** An unmodified Supabase dashboard template pointing at `<your-project-ref>`. 217 consecutive failures since 2026-08-20, still firing hourly, does no work. `select cron.unschedule('invoke-edge-function');` | `cron.job_run_details` jobid 24: 0 succeeded / 217 failed, `Bad hostname` |

## Open — verified gaps, not yet blocking

| # | Item | Notes |
|---|---|---|
| O1 | On-demand symbols are ingested once and never refreshed. `ingest-market-data` reads `data_providers.config.symbols` (31 hardcoded), not `symbol_directory`, so lazily-added symbols go stale. | M and ISRG 8 days stale; every on-demand symbol (AMD, PLTR, NFLX…) will follow |
| O2 | SPY is 10 days stale despite being in the provider config — a separate failure from O1, cause not yet found. | last bar 2026-08-19; directory `last_success_at` 2026-08-23 |
| O3 | No intraday data exists, and `historical_prices.ts` is a `date` column, so the schema cannot store it. 1D and 1W-hourly chart detail cannot be real without a schema change plus an intraday feed. **Needs an explicit in-scope / deferred decision.** | `cannot cast type date to time` |
| O4 | 3 residual scope-guard over-fires out of 42 replayed production flags (~7%). Genuine refusals still caught on "I would need to surface analyses from your Research page" phrasing. | `npx tsx scripts/replay-guard-log.ts` |
| O5 | `@vercel/analytics` is a dependency but imported nowhere. Wire it up or remove it. Note it would send data to a third party — see `docs/legal/privacy-policy.md`. | `package.json` |
| O6 | `public/robots.txt` now actually serves and says `Disallow: /`. Correct while unlaunched; must change at launch. | HTTP 200 |
| O7 | CSP is still `Report-Only`. Needs one pass in a real environment with the console open, then flip the header and restore `upgrade-insecure-requests`. | `next.config.ts` |
| O8 | `public.is_admin(uid)` is `SECURITY DEFINER` and executable by `anon`, so admin status for an arbitrary uid is probe-able. | Supabase security advisor |
| O9 | Supabase leaked-password protection is disabled. | Supabase security advisor |

## Closed by the 2026-08-29 pass

| Item | Evidence |
|---|---|
| Model provider contradiction — config was always Groq; a stale doc caused it | `/models` 200, `chat/completions` 200 in 0.34s |
| Privacy policy falsely claimed no third-party model provider | corrected in `7f0836f` |
| Stored analyses mislabelled `self-hosted:` | now `groq:openai/gpt-oss-120b` |
| Scope guard measured at 5/25 by the original audit | probe now 59/59; 25/25 held-out |
| Guard over-firing on real refusals | 27 of 42 production flags corrected |
| Lint reporting 12,471 problems | now 4 → 0, config fixed |
| `robots.txt` not served | moved to `public/`, HTTP 404 → 200 |
| README was the create-next-app boilerplate | replaced |

## Closed — carried over from `feedback.txt`

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
| "fix settings page, add more settings" | shipped in `dbb7951` — **but see B1: its migration is not applied** |
