# 2026-09-03 live-deployment scan - dev-lead follow-up

**Branch:** `fix/2026-09-03-audit-followups` - **PR only, not merged.** No agent
commits to `main`.

Works the punchlist in `docs/audits/2026-09-03-live-deployment-scan.md` in the
priority order the founder set. Bug-fixing and hygiene only - no roadmap
features. Every "fixed" below has a test run, a build, or a live DB query behind
it. The base is `main` = `dd95761` (2026-09-03 10:21). Re-verified against the
**current** main and the live project `vvferejzawkhzlmvvaog` - several audit
findings had already moved.

`tsc --noEmit` clean · `next build` compiled successfully · `eslint` clean on
every touched file · `test:proxy-paths` 15/15 · `test:waitlist-email` 24/24.

---

## 1. `/waitlist/confirm` reachable - ALREADY FIXED ON MAIN, verified live

The scan was written at `7c12462`. `main` is now well past it: PR #52
(`0127a50`, "fix(waitlist): make /waitlist/confirm reachable") landed the fix -
`src/proxy.ts` now delegates to `isPublicPath()` in `src/lib/public-paths.ts`,
which matches `/waitlist` as a **prefix**, so `/waitlist/confirm` reaches its
page. `scripts/tests/proxy-public-paths.ts` already pins it.

**Live proof it is working:** `waitlist` now has **1 confirmed row** -
`okit@umich.edu`, `status='confirmed'`, `created_at 2026-09-03 13:00Z`,
i.e. a real signup that clicked the email link and got through. At scan time it
was 0/4. Nothing to do here beyond confirming it.

## 2. `/robots.txt` not served + wrong content - FIXED (`5efabe5`)

Two faults, both real, both fixed:

- **Not served.** `curl -i .../robots.txt` → `307` to `/waitlist`. The
  `src/proxy.ts` matcher excluded `favicon.ico` and image extensions but not
  `.txt`, so the middleware ran on `/robots.txt`, saw no session, and bounced
  it. Fix: add `robots.txt|sitemap.xml` to the matcher's negative lookahead.
  Next only static-analyses a string literal there, so it stays inline; the
  same two paths are also added to `isPublicPath()` as a second layer.
- **Wrong content.** `public/robots.txt` read `User-agent: * / Allow: /` for a
  pre-launch site. Now `Disallow: /` for `*`. `facebookexternalhit` and
  `Twitterbot` keep `Allow: /` on purpose - they are link-preview fetchers, not
  search indexers, and the Instagram / Facebook / X bio links point at
  `/waitlist`; disallowing them would break the link card the founder is
  driving signups through. (`0d15fb6` had already added the Meta exception.)

`test:proxy-paths` gains 5 cases - it now compiles the real matcher regex from
`proxy.ts` and asserts `/robots.txt` and `/sitemap.xml` are excluded while `/`,
`/portfolio`, `/waitlist/confirm` still hit the middleware. 15/15.

**Founder action:** none for the repo. After merge + deploy, confirm
`curl -sI https://cairn-nu-rouge.vercel.app/robots.txt` → `200` and the body
reads `Disallow: /`.

## 3. Migration ledger drift (0036, and now 0037 too) - DOCUMENTED, backfill NOT run

`schema_migrations` ends at `20260830213609 / 0035`. Verified live:

| File | Live objects (diffed against the file - they match) |
|---|---|
| `0036_email_send_log` | `email_send_log` table (real data: 16 + 1 sends), `record_email_send(int)` `SECURITY DEFINER` |
| `0037_signup_consent` | `user_consents` (8 cols, RLS on, `own consents are readable` SELECT policy), `user_consents_user_id_idx` |

Both were applied out of band with no ledger row - `0037` is the same class of
break the audit flagged for `0036`, just newer, so it is folded in here.

Per the "PR-only" instruction the ledger was **not written to.**
`docs/migrations-ledger-reconciliation-2026-09-03.md` (in this PR) carries the
verification table and the exact two `insert into schema_migrations` statements
to run - `name` = file basename, synthetic `version` = each file's add-commit
timestamp (`20260902234504`, `20260903093140`), ordered after `0035`. Same
convention as the 2026-08-30 backfill of `0027`–`0032`.

**Founder action:** run the two inserts from the reconciliation doc (SQL editor
or MCP), or let `supabase db push` pick them up once version strings are
realigned.

## 4. `generate-daily-briefings` edge function stale - CONFIRMED, redeploy is a founder action

Deployed function is **version 3, 2026-08-30**. Pulled its source via MCP
`get_edge_function` and diffed against
`supabase/functions/generate-daily-briefings/index.ts` on `main`: the deployed
copy is missing the `dd079f5` (2026-08-31, PR #43/#44) rewrite - no
last-session price moves, no holdings/watchlist news (news only read when a
category filter is set), summary still says *"N story stories in your chosen
news categories"*. Live hourly briefings are running pre-2026-08-31 logic.

The repo copy is already correct. This is a **deploy**, not a code change, and
there is no merge that performs it. Not done this pass (PR-only).

**Founder action:**
`supabase functions deploy generate-daily-briefings --project-ref vvferejzawkhzlmvvaog`
(from `main`), or the MCP deploy. While at it, the other 7 functions are all on
their 2026-08-30 versions and match `main` **except** `ingest-calendar` - see §5.

## 5. `calendar_events` has only 2 rows - INVESTIGATED: not a silent failure

Findings:

- The daily job (`ingest-calendar-daily`, jobid 8) **runs and returns 200** -
  `function_edge_logs` shows `POST | 200` at `2026-09-03 06:30Z`. Not erroring.
- The 2 rows are **real, current Nasdaq data**: `GOOGL` ex-dividend 2026-09-04
  and `NVDA` ex-dividend 2026-09-10, both with `metadata.source = "nasdaq"`,
  `rate`, `payment_date`. So Nasdaq *is* reachable from the Supabase edge (a
  different IP range than a plain datacenter fetch - `api.nasdaq.com` timed out
  entirely from this session's `WebFetch`).
- The function filters Nasdaq's feed to the **31 tracked `market_data`
  symbols** and only keeps events in a 21-day forward window. Early September is
  between earnings seasons (Q2 ended in August, Q3 starts mid-October), so
  **0 earnings is correct**, and among 31 mostly-growth/crypto names only GOOGL
  and NVDA have an ex-dividend date in the next 3 weeks. 2 rows is plausibly the
  right answer, not a bug.

**One real latent bug found and fixed** (`acd54e7`): the function did
`delete().eq("metadata->>source","nasdaq")` **unconditionally**, then only
re-inserted `if (relevant.length > 0)`. A blocked Nasdaq run returns an empty
fetch (not an error), so a single bad run would wipe the calendar and leave it
empty until a run got through. Now it only touches the table when at least one
day in the window returned rows, and the response reports `days_with_data` /
`write_skipped` so a blocked run is observable.

This changes `ingest-calendar` behaviour, so like §4 it needs a redeploy to
take effect - **founder action**, same command with `ingest-calendar`.

## 6. Codebase-organizer

### 6a. Stale `.claude/worktrees/*` gitlinks - FIXED (`6ece9ca`)

8 git-worktree checkouts committed as bare `160000` gitlinks (no `.gitmodules`)
in `5bbb5ff`. `git rm --cached` all 8; `.gitignore` gains `/.claude/worktrees/`.
`git worktree list` still shows all 8 - they live in `.git/worktrees/` and are
untouched.

### 6b. "Clean up the BTC holding with no matching price data" - PREMISE NO LONGER HOLDS, not actioned

The audit's basis was "`historical_prices` has 0 rows for `BTC`/`BTC-USD`". That
has changed. Live now:

- `historical_prices` has **385 `BTC` bars** (latest `2026-08-30`).
- `crypto_metrics` has a fresh `BTC` row (`2026-09-03 18:00Z`).
- `symbol_directory` has `BTC` - `status='available'`, provider
  `yahoo_finance_chart`, 378 bars. **`BTC` is the canonical symbol** across
  `crypto_metrics`, `symbol_directory` and `historical_prices` - not `BTC-USD`.
- The holding is `user_id fea0d4e4…` = **the founder's own account**: 0.000544
  BTC, `purchase_price 85286.46`, `purchase_date 2025-12-01`. Reads as a real
  position, not test data.

So there is nothing broken to clean up, and deleting a real holding from the
founder's live portfolio is not something to do on a guess. **Flagged back:**
the only genuine wrinkle is that `BTC` price history is ~4 days stale (last bar
2026-08-30) - that is a crypto-history ingest-cadence question, separate from
this item. Say the word if you still want the row removed.

## 7. cfo-legal-advisor - Privacy Policy "automated verification" claim - SOFTENED (`6dddd23`)

*Non-lawyer draft; the page keeps its LegalShell "Draft - not reviewed by a
licensed attorney" banner.*

`src/app/privacy/page.tsx` implied every account deletion is verified. The
`supabase/tests/gdpr_erasure.sql` test is a **CI artifact** - it proves the
cascade design (inserts a user across every user-scoped table + the two-level
chains, deletes the auth user, asserts nothing remains, and asserts every table
with a user identifier carries `ON DELETE CASCADE`). `deleteAccount()` itself
only logs a no-PII line. Both the retention section and the deletion section now
say the automated test runs **in the build pipeline** and proves the deletion
**logic**, not that it re-checks each individual deletion.

## 8. pg_net 5000 ms cron timeout - MIGRATION WRITTEN (`7e41ab9`), apply is a founder action

Only **one** job is still on a sub-30s timeout: `ingest-news-every-15-min`
(jobid 1) at `timeout_milliseconds := 5000`. Migration 0017 set 60s everywhere;
this job was later re-created (cron-secret / vault rework) without carrying it
forward. Every other job is already 30–120s; `purge-scope-guard-log` has no
`http_post`. So `net._http_response` is ~all timeouts **for the news job only**.

`supabase/migrations/0038_news_cron_timeout.sql` re-registers any job whose
command carries a sub-30s `timeout_milliseconds` at 60s (idempotent). **Not
applied** - an `apply_migration` from this session was blocked, and it is a live
change, so it is left for the founder.

**Founder action:** `supabase db push` (picks up 0038), or apply the `do $$`
block from the migration file directly, then confirm
`select jobname, substring(command from 'timeout_milliseconds\s*:=\s*(\d+)')
from cron.job` shows 60000 for `ingest-news-every-15-min`.

## 9. bug-fixer - waitlist `client_timezone` never captured - FIXED (`1ca5ad6`)

Every `waitlist` row has `client_timezone = ''` - including `id 133`, confirmed
today. The column is nullable with no default, so `''` means the form submitted
an **empty** `tz` field, every time.

Root cause: `waitlist-form.tsx` wrote the IANA zone into a hidden `<input>` from
a `useEffect` via a ref. That DOM value never reached the `FormData` React
serialises for a `<form action>` submission - the same class of loss the file's
own comment describes for the email field ("React 19 resets uncontrolled fields
once a form action settles").

Fix: stamp `tz` onto the payload in a **submit wrapper** - `formData.set("tz",
Intl.DateTimeFormat().resolvedOptions().timeZone)` - right before dispatch,
where it provably makes it into the request. The ref / effect / hidden-input are
gone. New pure `parseClientTimezone()` in `src/lib/waitlist.ts` normalises it:
trims, rejects blank / `>64` / non-zone-shaped values, and returns `null` (not
`""`) for "unknown", so future rows read honestly. `test:waitlist-email` +10
cases (the parser + a structural check that the form stamps `tz` at submit and
no longer uses the lost pattern). 24/24.

---

## Flagged back to the founder - untouched, as instructed

| Item | Where it stands |
|---|---|
| Supabase leaked-password protection | Still `WARN` in `get_advisors(security)`. Dashboard toggle - yours. |
| Cerebras fallback funding | Not checked - funding decision. |
| Contact address / domain | No working contact address on privacy/terms/accessibility; blocked on the domain decision. |
| ToS §12 (governing law & disputes) | Still an explicit placeholder. |
| Stripe keys | `BILLING_ENABLED` off, no keys, never run end-to-end. |
| Groq zero-data-retention | Still a pending org-level admin step; Privacy Policy already discloses this accurately. |

## Founder actions queued by this pass (all live-infra, none merge via PR)

1. **Deploy** `generate-daily-briefings` and `ingest-calendar` from `main`
   (§4, §5) - `supabase functions deploy <slug> --project-ref vvferejzawkhzlmvvaog`.
2. **Apply** migration `0038` (§8) - `supabase db push` or the `do $$` block.
3. **Backfill** the `0036` / `0037` ledger rows (§3) - 2 inserts in
   `docs/migrations-ledger-reconciliation-2026-09-03.md`.
4. **Decide** on the founder's `BTC` holding (§6b) - recommend leaving it.
5. Post-deploy smoke checks noted inline in §2, §8.

## Commits on `fix/2026-09-03-audit-followups`

```
5efabe5  fix(proxy): serve /robots.txt + /sitemap.xml, set robots to Disallow
1ca5ad6  fix(waitlist): capture client timezone at submit time
6ece9ca  chore: stop tracking .claude/worktrees/* gitlinks
acd54e7  fix(edge): don't wipe calendar_events on a blocked Nasdaq fetch
7e41ab9  chore(db): news cron pg_net timeout migration + ledger reconciliation notes
6dddd23  docs(legal): scope the deletion "automated test" claim to CI
```
