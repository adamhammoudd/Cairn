# Remediation pass 2 - Waves 2, 5, 7, 10, 12

**Date:** 2026-08-20 · **Role:** dev-lead
**Standard:** every "fixed" claim carries the query result, test output, or HTTP
response that proves it. Nothing here was verified by reading code.

---

## The headline finding

Waves 1–9 were committed to `main` and reported done. A large part of that work
**never reached the running system**, and every previous report was written
against the repository rather than the database.

| Check | Reported | Actual, 2026-08-20 |
|---|---|---|
| Migrations applied | through 0023 | **through 0018** - 0019–0023 never ran |
| `search_symbols()` RPC | fixed | **did not exist**; the app called a missing function |
| `auth_attempts` table | rate limiting live | **did not exist**; limiter silently inert |
| `ingest-historical-events` | deployed | **HTTP 404** - never deployed |
| Edge function hardening | shipped | **not deployed**; fleet still on pre-hardening versions |

This is the same failure class the original audit caught with the cron jobs:
correct code, plausible commit message, nothing running. The lesson that
generalises - **a migration in the repo is not a migration in the database**.

---

## Wave 2 - the analog/news gap (root cause of `ai_analyses` = 0)

Two independent bugs, either of which alone produced a silent zero-row run.

1. **Never deployed.** The cron job existed; the function did not. `POST` to it
   returned `{"code":"NOT_FOUND","message":"Requested function was not found"}`.
2. **The upsert could never have worked.** `0018` created the uniqueness guard
   as a **partial** index (`WHERE symbol IS NOT NULL`). Postgres only uses a
   partial index as an `ON CONFLICT` arbiter if the statement repeats the
   predicate, and PostgREST's `on_conflict=` never emits one. Reproduced
   directly:

   ```
   {"code":"42P10","message":"there is no unique or exclusion constraint
    matching the ON CONFLICT specification"}
   ```

   Fixing only the deploy would have produced a second silent failure.
   `0024` adds a matchable index.
3. **A third bug found on the way:** the function read `config.symbols` as
   `string[]`, but `0020` rewrote it into a mixed string/object array, so the
   first object entry threw and cost the entire run.

### Result - `historical_events`

| event_type | rows | usable (before+after price) | symbols |
|---|---|---|---|
| earnings | 24 | 24 | 6 |
| dividend | 39 | 39 | 5 |
| volatility_regime | 36 | 36 | 18 |

Equity analogs: **0 → 63**, all with real reaction windows read back out of
`historical_prices`. Sample: `AAPL earnings 2026-07-30, 338.19 → 308.91
(-8.66%), EPS 1.91 vs consensus 1.88`.

### Crypto news tagging

The tagger gained crypto support, but tagging happens at ingest time only, so
777 stored articles kept their old tags: **0** crypto tickers, **0** crypto
sectors. `scripts/backfill-news-tags.ts` re-tags stored rows, importing the
real tagger so it cannot drift from `ingest-news`.

Result: **0 → 35** crypto-sector articles, 28 carrying crypto tickers. Spot
check found no false positives on the collision-prone symbols (RAIN, HYPE,
LEO, GRAM).

### Completeness gate

| symbol | sources | usable analogs |
|---|---|---|
| AAPL | 4 | 12 (was 0) |
| BTC | 21 | 1 |
| NVDA | 6 | 12 (was 0) |
| TSLA | 3 | 4 (was 0) |

Both audit failure cases now have data on both required axes. **Generation
itself remains blocked on Wave 3** - see Blockers.

---

## Wave 5 - universe size

Re-ran the audit's exact 24-ticker list.

- Before: **0/24** present. After: **24/24**, 0 missing.
- `search("RK")` → `RKLB` - the exact reported failure.
- `asset_type` spread: crypto 26, equity 21, **etf 10** (the ETF tab held 1).

Bounded on purpose. `ingest-market-data` fetches serially with no backoff and
Yahoo publishes no quota, so a jump to several hundred symbols needs throttling
first. The lazy-ingestion recommendation in the universe-size decision brief
still stands; this stops the reported failure at a size verifiable today.

---

## Waves 7 & 10 - security, verified by attack

### Authorization / IDOR

Two real users created, user A seeded with private rows, user B given a valid
JWT and pointed at A's exact resource IDs.

| Attempt | Result |
|---|---|
| Read A's holding / watchlist / chat session by id | **0 rows** each |
| Enumerate all holdings | **0 rows** |
| `PATCH` A's holding (quantity → 9999) | **0 rows**; value unchanged |
| `DELETE` A's watchlist | **0 rows**; row confirmed still present |
| `INSERT` holding with forged `user_id` | **HTTP 403** |
| Anonymous read of 17 user tables | **0 rows** on all (tables non-empty) |

Test users and their data deleted afterwards; row counts confirmed back to
baseline.

### RLS, per table (read, not assumed)

All 29 public tables have RLS **enabled**. Every user-data table carries
`auth.uid() = user_id` or a parent-join equivalent:

- Direct owner predicate: `holdings`, `watchlists`, `alerts`, `chat_sessions`,
  `profiles`, `user_settings`, `subscriptions`, `goals`, `saved_screens`,
  `daily_briefings`, `dashboard_preferences`, `ai_usage_events`,
  `chat_usage_events`
- Parent-join: `watchlist_items` → `watchlists`, `chat_messages` →
  `chat_sessions`, `alert_deliveries` → `alerts`
- Intentionally public read (market reference data): `historical_prices`,
  `news_items`, `historical_events`, `fundamentals`, `crypto_metrics`,
  `calendar_events`, `data_providers`, `esg_scores`
- No policy by design (service-role-only ledgers): `auth_attempts`,
  `ai_scope_guard_log`

### Findings fixed from the Supabase advisor

`handle_new_user()` and `rls_auto_enable()` were `SECURITY DEFINER` **and**
`EXECUTE`-able by `anon`. PostgREST exposes every public function as an RPC, so
both were reachable unauthenticated at `/rest/v1/rpc/`. Revoked. `search_path`
pinned on two functions. **Advisor findings: 10 → 4**, remainder documented as
intentional in `0025`.

### Rate limiting

`npm run test:auth-rate-limit` - **10/10 against the live table**, including an
assertion that the rows actually persisted. That assertion is the one that
catches the missing-migration case, where `recordAuthAttempt` swallows the
error and every other check passes by failing open.

### Secrets

- Full history scanned for JWT-shaped literals: the only hit is the canonical
  jwt.io **sample** token inside a vendored third-party skill fixture.
- No `.env` file has ever been committed; `.gitignore` covers `.env.local`.
- Client bundle (39 assets): service-role key **absent**, market-data key
  **absent**, anon key present - correct, and RLS is proven above.

### Headers, verified on a real response

`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`,
`Permissions-Policy`, `X-DNS-Prefetch-Control: off`, `Strict-Transport-Security:
max-age=63072000; includeSubDomains; preload`, and CSP in **Report-Only** (a
deliberate, documented staging choice).

Sessions are cookie-based via `@supabase/ssr`; `grep` for
`localStorage|sessionStorage` across `src/` returns nothing.

---

## Wave 12 - compliance

- **AI-use disclosure** stated plainly in the privacy policy and in the footer
  of every public page. Cairn has no separate marketing site - `/` is the
  authenticated dashboard, so the auth surface *is* the landing page.
- **ToS §6** user-submitted content and takedown; **§7** arbitration, drafted
  as intent and explicitly flagged in the body as needing per-jurisdiction
  legal review; **§8** AI use.
- **`/accessibility`** statement, linked from both footers, claiming only the
  palette-contrast suite that actually gates the build and stating plainly what
  has *not* been done.

---

## Billing (the part worth doing without a Stripe account)

`setTier()` accepted `tier=premium` from any signed-in user and wrote it
straight to `subscriptions` - a single form POST was an unlimited free upgrade,
and every premium feature routes through `getUserPlan()`, which reads that
column. Now refused **server-side** behind `BILLING_ENABLED` (absent =
disabled), not by hiding the button. Downgrades remain unconditionally allowed.

---

## Blockers - not fixable from here

### 1. `CRON_SECRET` is not set (one command)

`POST` to the newly deployed function returns, correctly:

```
503 {"error":"CRON_SECRET is not configured for this function;
     refusing to run unauthenticated."}
```

The hardened Edge Function code is committed and correct, and fails closed by
design. But the secret can only be set with the Supabase CLI or dashboard, and
no access token is available in this environment. **Consequence:** the other 7
functions were deliberately left on their older, working deployments - pushing
the hardened build to them without the secret would 503 every ingestion job and
take a working system down. They therefore still run with `CORS: *` and no
caller authentication.

```
openssl rand -hex 32                     # call it VALUE
supabase secrets set CRON_SECRET=VALUE
# then, in SQL:
alter database postgres set app.settings.cron_secret = 'VALUE';
# then apply 0023 and redeploy all 8 functions
```

### 2. No model endpoint (Wave 3 - a founder decision, still open)

`LLM_BASE_URL` points at `http://127.0.0.1:11434/v1`; nothing is listening, and
Ollama is not installed. A localhost URL cannot work from Vercel regardless.
Until this is decided, `ai_analyses` stays at 0 rows no matter how good the
data is, and two gating suites stay INCOMPLETE. See
`docs/decisions/2026-08-20-model-provider.md`.

### 3. Leaked-password protection is off

Supabase Auth setting (HaveIBeenPwned check), dashboard-only.

### 4. `npm run test:a11y` cannot run here

Playwright resolves a Linux browser path no env var sets. The contrast suite
(20/20) does run and does gate the build; the axe pass does not. The
accessibility statement says so rather than implying otherwise.

---

## Suite status

138 passing across 8 gating suites. Two gating suites report **INCOMPLETE** and
the runner exits non-zero:

```
INCOMPLETE - 2 gating suite(s) executed no tests: Adversarial scope-guard -
Tier B (live pipeline), Citation freshness check
   Nothing failed, but nothing was proven either. This is not a pass.
```

Both are LLM-dependent. The false-green CI signal the original audit caught is
genuinely fixed - a zero-test gating suite now fails the build.
