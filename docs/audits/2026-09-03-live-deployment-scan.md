# 2026-09-03 full scan — codebase + live Supabase + live deployment — dev-lead report

**Report only. Nothing was fixed.** One production mutation was performed as an explicit part of the
task (hitting the live waitlist confirmation link); it had no effect because the flow is broken —
see §2.

**Targets checked**
- Live site: `https://cairn-nu-rouge.vercel.app` (the URL the founder supplied mid-scan; the
  `.env.local` value `cairn-lime.vercel.app` is stale and returns `DEPLOYMENT_NOT_FOUND`).
- Supabase project `vvferejzawkhzlmvvaog` (`eu-west-1`, Postgres 17.6, `ACTIVE_HEALTHY`) via the
  Supabase MCP (SQL, advisors, edge-function source, migration ledger).
- Repo at `main` = `7c1246260a20b38a2f765f87ed8cbf62834bdb47` ("Merge PR #51 … waitlist-gmail-smtp-bridge",
  committed 2026-09-02 23:47 +0200). Local tree clean, `HEAD == origin/main`, 0 ahead / 0 behind.

**Standing-rule note.** Where a check needs an authenticated in-app session (portfolio, ticker,
assistant, Research, live analysis generation, live scope-guard through-path, `/admin`), it could
not be run — the whole app is behind a waitlist gate and no test credentials were provided. Those
items say so explicitly and are collected at the end. The browser extension for
visual/mobile-width/console checks was not connected this session (`tabs_context_mcp` →
"Browser extension is not connected"); those items are also collected at the end.

---

## 1. Live site

| Item | Status | Evidence |
|---|---|---|
| Deployed build matches a real commit on `main`, not `-dirty` | **Partly verified** | `main` HEAD is `7c12462` (2026-09-02 23:47). Site is live: `GET /waitlist` → `200`, `Server: Vercel`, `X-Powered-By: Next.js`, Turbopack chunk `turbopack-0a0a63px168lw.js` in the HTML (matches "Next 16 + Turbopack"). The deployed commit SHA is **not exposed** on any public route (no version endpoint; `BuildBadge` is production-gated, see below), so I can't independently prove deploy == `7c12462` from outside. A Vercel build cannot be `-dirty` — it builds from a committed SHA (`VERCEL_GIT_COMMIT_SHA`), so "-dirty" is structurally impossible here regardless. |
| CSP enforcing or report-only | **Report-Only (unchanged)** | `curl -I https://cairn-nu-rouge.vercel.app/` → header is `Content-Security-Policy-Report-Only: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://vvferejzawkhzlmvvaog.supabase.co wss://…; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'`. `next.config.ts:56` still emits `Content-Security-Policy-Report-Only`; lines 16-27 say this is deliberate pending "one pass in a real environment with the console open". That pass is now possible and has not happened. `'unsafe-inline'` on `script-src` remains (Next bootstrap/hydration; nonce plumbing noted as outstanding in the config comment). |
| HSTS present | **Yes** | `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` on every response (`/`, `/waitlist`, `/robots.txt`, `/login`). |
| Other security headers | **Present** | `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()`, `X-DNS-Prefetch-Control: off`. |
| Browser console clean | **Not checked** | Browser extension not connected this session. HTML/asset fetch shows no obvious inline error; a real console read is still needed. |
| `robots.txt` served and reads `Disallow: /` | **BROKEN — two faults** | (1) `curl -i https://cairn-nu-rouge.vercel.app/robots.txt` → `307` redirect to `/waitlist`, body `Redirecting...`. `src/proxy.ts`'s matcher only excludes `_next/static`, `_next/image`, `favicon.ico` and image extensions, so the middleware runs on `/robots.txt` and (no user, not a listed public route) redirects it. There is effectively **no robots.txt in production**. (2) Even the file that would be served, `public/robots.txt`, reads `User-agent: * / Allow: /` (and `Allow: /` for `facebookexternalhit`) — **not** `Disallow: /`. Both are wrong for a pre-launch site. |
| `BuildBadge` gated from production / doesn't overlap content on `/login` `/signup` at ~375px | **Gated — confirmed; overlap check N/A** | `src/app/layout.tsx:42`: `{process.env.VERCEL_ENV !== "production" && <BuildBadge />}`. The production `/waitlist` HTML contains no fixed-corner badge markup (`grep` for `position:fixed` / `getBuildId` / `build <sha> ·` → nothing). `/login` and `/signup` are unreachable in production anyway (redirect to `/waitlist`, see next row), so there is nothing for the badge to overlap. |
| `/login`, `/signup` reachable in production | **No — gated to `/waitlist`** | `curl -sI /login` and `/signup` → `307`, `Location: /waitlist`. `src/proxy.ts` `publicRoutes` = `["/waitlist","/privacy","/terms","/accessibility"]` + anything under `/api`; everything else for an unauthenticated visitor redirects to `/waitlist`. |
| Form fields wipe on validation error | **Fixed in source; not verifiable live** | `src/app/(auth)/login/page.tsx:33-37` + `:56` — email is a controlled `useState` input (`value={email}`), comment: "Controlled so a failed sign-in keeps the email in the box". Same in `src/app/(auth)/signup/page.tsx:12-16,32,42` (name + email) and `src/app/waitlist/waitlist-form.tsx:44-45` ("React 19 resets uncontrolled fields once a form action settles"). Passwords deliberately left uncontrolled. The production `/waitlist` HTML shows `<input id="wl-email" … value="">` (controlled). Live confirmation on `/login` and `/signup` is blocked — those routes are gated. |
| Auth → portfolio → ticker → assistant → Research walkthrough as a signed-in user | **Not run** | No test credentials, and self-serve signup is gated. Needs a login. |

---

## 2. Waitlist — full live verification

**Headline finding: the waitlist confirmation flow is broken in production. No signup can be confirmed.**

| Item | Status | Evidence |
|---|---|---|
| Sign-up on the live site produces a confirmation email | **Yes** | A live pending row already existed when the scan started — `waitlist.id = 130`, `adamhammoud09@gmail.com`, `status='pending'`, `created_at 2026-09-03 06:26:41Z` (the founder's own test signup). `email_send_log` shows `2026-09-02: 16` and `2026-09-03: 1` sends via the Gmail SMTP bridge. Confirmed via the connected Gmail account: a message *"Confirm your spot on the Cairn waitlist"* from `cairnai.business@gmail.com` to `adamhammoud09@gmail.com`, `2026-09-03T06:26:42Z`. So the send path (Gmail SMTP bridge, migration 0036) works. |
| Link inside the email points at the real domain | **Yes** | Body of that message contains `https://cairn-nu-rouge.vercel.app/waitlist/confirm?token=10dc8024-939f-4a8b-9ed0-e311403cc216` (token cross-checked against `waitlist.confirmation_token` for id 130). Not `localhost`, not `cairn-lime`. `siteUrl()` in `src/lib/waitlist.ts` prefers `NEXT_PUBLIC_SITE_URL` then the request `origin` header — one of those is correct in Vercel prod even though local `.env.local` is stale. |
| Clicking the link marks the signup confirmed and counts it toward the founding-50 | **BROKEN** | `curl -s -o /dev/null -w '%{http_code} %{redirect_url}' 'https://cairn-nu-rouge.vercel.app/waitlist/confirm?token=10dc8024-…'` → `307 https://cairn-nu-rouge.vercel.app/waitlist`. Same for a bogus token. **Root cause:** `src/proxy.ts` gates on `publicRoutes.includes(pathname)` — an **exact** match. `pathname` for the confirm page is `/waitlist/confirm`, which is not in the list, so every unauthenticated visitor (i.e. everyone who clicks an email link) is redirected to `/waitlist` before `src/app/waitlist/confirm/page.tsx` ever runs its `confirm_waitlist` RPC. Post-check: `waitlist` still has **0 confirmed rows** out of 4, despite 17 confirmation emails sent. `/privacy` (which *is* in the allowlist) returns `200` — confirms the allowlist mechanism, and confirms `/waitlist/confirm` was simply omitted from it. The `confirm_waitlist(uuid)` function itself is correct (advisory lock, `position = count(confirmed)+1`, `founding = position <= 50`, idempotent) — it is just never reached. |
| Abuse-prevention (IP/device flagging for review) against real waitlist data | **Mechanism present; 0 legitimate signups flagged; does not block confirmation** | Schema has `waitlist.signup_ip inet`, `user_agent`, `client_timezone`, `review_flag bool default false`. `src/lib/waitlist.ts`: `checkSignupRate()` soft-blocks at **>4 signups per IP per 10 min** (fails *open* on DB error); `flagIfClustered()` sets `review_flag = true` on any group of **≥2 rows sharing IP *and* user-agent within 60 min** (fails *silent*, never rejects). Current real data: all 4 rows have distinct IPs, distinct user-agents, ≥2 min apart → **0 flagged**, which is correct (they are genuinely distinct people). `flagIfClustered` runs before the email send and only writes `review_flag`; it has no path that blocks a confirmation. Note: `client_timezone` is `''` for all 4 rows — the form's hidden `tz` field (`waitlist-form.tsx` writes it via `useEffect` on mount) is not making it into the row, so that particular review signal is dead. Minor; not blocking. |
| Instagram / Facebook page bios' link-in-bio points at the live waitlist URL | **Not verified** | Requires access to the IG/FB pages; not available through the connected tools this session. Needs a manual check or social-account access. Commit `0d15fb6` ("Made link safe for Meta") added the `facebookexternalhit → Allow: /` rule to `public/robots.txt`, implying a Meta link exists, but its target can't be inspected from here. |

---

## 3. AI assistant & probability engine

| Item | Status | Evidence |
|---|---|---|
| Model endpoint (Groq / fallback) correctly set and reachable **from the live deployment** | **Primary reachable from local with prod creds; live-deployment parity not independently confirmed; fallback is unpaid** | `npm run test:live` (uses `.env.local`, which per the Vercel-recreate memory note mirrors prod): `health: {"ok":true,"detail":"primary (https://api.groq.com/openai/v1): reachable, model \"openai/gpt-oss-120b\" generated; fallback (https://api.cerebras.ai/v1): model \"gpt-oss-120b\" HTTP 402 {\"message\":\"Payment required to access this resource…\"}"}`, `latency_ms: 145`, real completion returned. So: **primary Groq works**; **Cerebras fallback returns HTTP 402 — the account has no quota/credit**. I cannot hit the live deployment's `/api/chat` (auth-gated) or read Vercel env, so I can't prove the prod env vars match local. Per the 2026-08-30 audit, the degraded path when the fallback is unavailable is a graceful `BUSY_MESSAGE`, not a raw error. |
| Real analysis generation on the live site for one equity + one crypto scope, with real sources/analogs | **Not run live; existing rows confirm the pipeline produces complete equity + crypto analyses** | Can't trigger generation without an authenticated session. `ai_analyses` = 17 rows, **all `status='validated'`, every row has ≥1 source AND ≥1 historical analog** (295 source links, 154 analog links total). Equity coverage: MSFT (25 srcs / 15 analogs, newest, 2026-09-01 13:48Z), NVDA, AAPL, GOOGL, TSLA, TSM, AXON. Crypto coverage: XRP (25/2), SOL (1/3), ETH (7/1), BTC (21/1). No `market`- or `sector`-scoped analyses have ever been generated (all 17 are `ticker`) — those code paths are unexercised in production. Newest analysis is 2 days old. |
| Scope-guard adversarial probe — current real pass rate | **Deterministic gate: 100%** | `npx tsx scripts/tests/scope-guard-probe.ts` → **37/37 adversarial cases caught, 22/22 compliant cases not over-fired, held-out audit set 25/25**. `npm run test:stripe-webhook`-style suites also green. The **live end-to-end** probe (Tier B of `scripts/tests/adversarial-scope-guard.ts`, which runs prompts through `runChatTurn` against the real model) **could not run** — the harness blocks on `llmHealthCheck()` / the report writer and timed out at 90s twice. Deterministic layer is the "hard technical gate" the guardrail names, and it is at 100%. |

---

## 4. Data pipeline

| Item | Status | Evidence |
|---|---|---|
| Scheduled ingestion jobs have recent successful runs | **All 11 cron jobs dispatch on schedule; edge-function-level success verified separately by data freshness** | `cron.job` = 11 active jobs. `cron.job_run_details` over 7 days: every job's most recent run is `status='succeeded'` with 0 failed rows in the window — `ingest-news-every-15-min` 672 runs (last 2026-09-03 06:30Z), `ingest-crypto` 84, `generate-daily-briefings` 92, `ingest-calendar-daily` 7, `ingest-market-data-daily` 5, `evaluate-alerts` morning+post-close 5+5, `ingest-historical-events-daily` 5, `ingest-fundamentals-weekly` 1 (last 2026-08-31), `purge-scope-guard-log` 4. **Caveat:** `job_run_details.succeeded` only means the `select net.http_post(...)` returned — it is fire-and-forget. `net._http_response` for the last 24h shows **~24 rows of "Timeout of 5000 ms reached"** (the 15-min news cron's `timeout_milliseconds := 5000`) plus one 60 000 ms timeout, and only **9 HTTP 200s** — pg_net gives up long before the function finishes. So there is effectively **no automated success/failure signal for ingestion**; the real evidence is the freshness check below. |
| Data actually fresh | **Yes for the trading-day-relative sources** | Direct `max()` queries: `news_items` last ingest `2026-09-03 06:30:11Z` (9 496 rows); `crypto_metrics` `2026-09-03 06:00:08Z` (265); `symbol_directory` 75/75 `status='available'`, last success `2026-09-02 22:00Z`; `historical_prices` — SPY latest bar `2026-09-03`, AAPL/NVDA/TSLA `2026-09-02` (correct: it's 06:xx UTC, the 2026-09-03 US close hasn't happened; the daily job runs 22:00 UTC weekdays). `fundamentals` `as_of 2026-08-31` (weekly). `historical_events` `2026-09-01`. **Thin:** `calendar_events` has only **2 rows** total (max `event_date 2026-09-10`) despite a daily job that reports success — worth a look at whether the function is actually writing. `daily_briefings` max `briefing_date 2026-09-02` (no 2026-09-03 row yet — the 2 users' `briefing_hour_local` is 12 UTC, not yet reached; plausibly fine). |
| Five previously-stale edge functions still on current deployed versions (not regressed) | **Not regressed — but `generate-daily-briefings` is stale against `main`** | All 8 functions last deployed **2026-08-30** (12:00–21:04 UTC): `ingest-market-data` v4, `generate-daily-briefings` v3, `ingest-calendar` v3, `ingest-fundamentals` v3, `evaluate-alerts` v3, `ingest-crypto` v7, `ingest-news` v4, `ingest-historical-events` v4 — i.e. the versions the 2026-08-30 remediation pass left them at; none rolled back. **However:** commit `dd079f5` (2026-08-31 08:16, on `main` via PR #43/#44) rewrote `supabase/functions/generate-daily-briefings/index.ts` to add last-session price moves and holdings/watchlist news. The deployed function source (pulled via MCP `get_edge_function`) still has the **old** summary logic (`"${news.length} story… in your chosen news categories"`, news only read when a category filter is set) — **it was never redeployed.** Live cron briefings are running pre-2026-08-31 logic. The `briefing-summary` test (8/8) only covers the Node-side composer, not this Deno function. |
| SPY + previously-stale symbols current | **Fresh** | SPY: latest bar `2026-09-03`, 519 bars. AAPL/NVDA/TSLA: `2026-09-02`, 519 bars each. `BTC-USD`: **0 rows** in `historical_prices` — crypto price history isn't stored there at all (only `crypto_metrics` spot); relevant to how a crypto-scope analysis sources its price history. |

---

## 5. Charts

| Item | Status | Evidence |
|---|---|---|
| Dynamic X-axis on Portfolio + Ticker charts | **Implemented + tested** | `npm run test:x-axis` → **34/34** (`scripts/tests/x-axis-config.ts`), covering all 6 timeframes, daily-bar date pinned to its own calendar day (UTC), intraday keeping a time component. `src/lib/chart-dates.ts` (`formatChartLabel`, `formatTooltipLabel`) and `src/lib/intraday-window.ts` are on `main`; `npm run test:intraday-window` → **22/22**. The 2026-08-30 pass had already wired `<XAxis>` into `portfolio-chart.tsx` / `ticker-chart.tsx`; the 2026-08-31 pass added the timezone-correct date formatting. |
| Query-ordering bug pattern (`ascending` + `LIMIT` returning oldest rows) reintroduced anywhere new | **Not found** | `git grep` for `order(… ascending: true)` immediately followed by `.limit(`: hits are `v1/holdings` (`order("symbol")` — alphabetical, LIMIT is a cap), `v1/watchlists` (`order("sort_order")`), `calendar.ts` / `ticker.ts` / `briefing.ts` (`order("event_date", ascending: true)` for *upcoming* events, where ascending is the intended direction and there's a date-floor filter). The known-bad case — newest-N of `historical_prices` — is handled correctly: `src/app/api/v1/prices/[symbol]/route.ts` fetches `ascending:false` then `.reverse()` with an explicit comment, and per-symbol reads go through the `recent_prices` lateral-join RPC. `test:read-errors` 17/17, `test:briefing-summary` 8/8. |

---

## 6. Security — re-verify every item from the 2026-08-30 list

| # | Item | Status | Evidence |
|---|---|---|---|
| 6.1 | `is_admin(uuid)` anon/authenticated EXECUTE | **Still fixed** | `has_function_privilege` check: `is_admin(uid uuid)` EXECUTE roles = **`service_role` only**; `security definer`, `search_path = public, pg_temp`. `anon` and `authenticated` cannot call it. |
| 6.2 | Raw-error leakage on the two v1 routes | **Still fixed** | `src/app/api/v1/holdings/route.ts` and `.../watchlists/route.ts` both do `console.error(realError)` server-side and return a generic `apiError(500, "query_failed", "Could not load … Please try again.")`. Same pattern extended to `v1/analyses` and `v1/prices/[symbol]`. No PostgREST/Postgres error text in any response body. |
| 6.3 | RLS on `ai_analysis_sources` / `ai_analysis_historical_analogs` | **Still fixed** | `pg_policies`: both carry `public read validated` — `SELECT` for role `public` `USING (EXISTS (SELECT 1 FROM ai_analyses a WHERE a.id = <child>.analysis_id AND a.status = 'validated'))`. Not `USING (true)`. `ai_analyses` itself: `public read` `USING (status = 'validated')`. |
| 6.4 | CSP report-only → enforcing | **Still Report-Only** | Now checkable live (§1): response header is `Content-Security-Policy-Report-Only`. Not flipped. |
| 6.5 | Supabase leaked-password protection | **Still disabled** | `get_advisors(type: security)` → `auth_leaked_password_protection` **WARN**: "Leaked password protection is currently disabled." Dashboard toggle, founder action. |
| 6.6 | `pg_net` schema location | **Fixed** | `pg_extension` join: `pg_net` is in schema **`extensions`** (v0.20.4), not `public`. `pg_cron` in `pg_catalog`, `pgcrypto`/`uuid-ossp`/`pg_stat_statements` in `extensions`. No `extension_in_public` advisor. |
| 6.7 | Secrets scan across new commits since the last check | **Clean** | Commits since `8bcff28` (2026-09-02) scanned (`git diff 5bbb5ff..HEAD` over source/config/sql/md). Only hits: `.env.local.example` placeholder key *names* (`RESEND_API_KEY`, `GMAIL_SMTP_APP_PASSWORD=` empty), and `scripts/tests/waitlist-email.ts` fixtures with obviously-fake values (`re_x`, `"abcd efgh ijkl mnop"`). `.env.local` is git-ignored (`git check-ignore` confirms); only `.env.local.example` is tracked. `git grep` for JWT/`sk_live`/`sk_test`/`re_`/PEM patterns across `src/`,`supabase/`,`scripts/`,`docs/` → one comment in `src/lib/stripe.ts` describing key format, no live values. |

**Residual advisor INFOs** (unchanged, benign by design): `rls_enabled_no_policy` on `ai_scope_guard_log`, `auth_attempts`, `email_send_log`, `waitlist` — RLS on + no policy = deny-all to `anon`/`authenticated`, service-role only. Intentional.

---

## 7. Legal & compliance — against the live pages

Read live: `/privacy`, `/terms`, `/accessibility` (all reachable, `200`, all `Last updated 30 August 2026`, all still carry the `LegalShell` "Draft — not legal advice / not reviewed by a licensed attorney / not launch-ready" banner).

| Item | Status | Evidence |
|---|---|---|
| ToS §§9–12 filled in or still placeholder | **§§9–11 substantive (with review flags); §12 still an explicit placeholder** | Live `/terms`: §9 Subscriptions & billing (Stripe, auto-renew, cancel-anytime; explicitly flags refund policy / proration / price-change notice / tax as unresolved drafts). §10 Disclaimers & limitation of liability (as-is; liability cap as an *intent statement*, flagged for review, EU/UK carve-outs). §11 Termination (delete from Settings; suspension for market-manipulative content; survival). **§12 Governing law & disputes**: *"The governing law, the courts or forum for disputes … all depend on the jurisdiction(s) in which Cairn actually launches, which is not yet decided."* — unresolved. |
| A real contact address, published and working | **No — none published anywhere** | `/terms` §12/§14 defers contact to the Privacy Policy. `/privacy` contact section: *"Not yet published"*, intended as `privacy@` / `support@` on a domain "once registered". `/accessibility` points readers to "the contact address on the Privacy Policy page" — which doesn't exist. There is **no working contact address on any of the three pages.** Blocked on the domain decision. |
| Named GDPR / CCPA sections present | **Yes, in the Privacy Policy** | `/privacy` has a named UK/EU GDPR section (rights enumerated: access, rectification, erasure, restriction, objection, portability, right to complain to a supervisory authority / ICO) and a named California CCPA/CPRA section (incl. "Do Not Sell or Share" and non-discrimination). Groq is disclosed by name as a third-party AI processor ("chat messages, prior turns … and the ticker/sector scope" transmitted). Supabase `eu-west-1` disclosed; Groq US transfer mechanism "TBC by counsel". |
| Account-deletion cascade reaching the scope-guard log and AI provider | **Cascade covers all user tables + is tested; scope-guard log covered by time-retention (by design); AI provider NOT reached (no API), ZDR still a pending founder action** | `src/lib/actions/settings.ts` `deleteAccount()` → `admin.auth.admin.deleteUser(user.id)`, relies on `ON DELETE CASCADE` from `auth.users`. `supabase/tests/gdpr_erasure.sql` is a real test that inserts a user across 14 tables + 3 two-level chains, deletes the auth user, asserts every row is gone, **and** asserts (schema meta-query) that every `public` table with a `user_id` column has an `ON DELETE CASCADE` FK. `ai_scope_guard_log` has **no `user_id`** by design — covered by `purge_scope_guard_log()` (deletes non-test rows older than 90 days; cron `purge-scope-guard-log` active, last succeeded `2026-09-03 03:30Z`; migration `0035`). Groq: `deleteAccount()`'s own comment documents there is **no per-record deletion API**; the real control is org-level Zero Data Retention, "tracked as a founder action item" — **not yet done**. Note: the Privacy Policy says deletion happens "with automated verification" — the `gdpr_erasure.sql` test is that verification, but it is a CI artifact, not something that runs per real deletion; `deleteAccount()` only logs a no-PII line. Mild overclaim in the copy. |

---

## 8. Billing

| Item | Status | Evidence |
|---|---|---|
| Stripe integration completed | **Built and on `main` (PR #43/#44); not run end-to-end** | `src/lib/stripe.ts`, `src/app/api/stripe/webhook/route.ts`, `src/lib/actions/checkout.ts` all present on `main` and deployed. `npm run test:stripe-webhook` → **10/10** (status→tier map, signature acceptance/rejection). |
| Test or Live mode | **Neither active — `BILLING_ENABLED` is off** | `billingEnabled()` = `process.env.BILLING_ENABLED === "true" && stripeConfigured()`. `subscriptions` table: 1 row, `tier='free'`, no `stripe_customer_id`/`stripe_subscription_id`. `subscription_events`: 1 row, `source='self_serve'` (a free-tier change, not a payment). No evidence any Stripe key is set in prod; can't read Vercel env directly. Founder still needs to supply keys + run the local `docs/stripe-integration-spec.md` §3 flow. |
| Webhook signature verification actually in place | **Yes** | `src/app/api/stripe/webhook/route.ts`: `stripe.webhooks.constructEvent(body, signature, secret)` inside try/catch → bad/absent/tampered signature returns `400` with no data touched; missing `STRIPE_WEBHOOK_SECRET` → `503`; `runtime = "nodejs"`, `dynamic = "force-dynamic"`; on `checkout.session.completed` etc. it re-reads the customer's real subscription from Stripe rather than trusting the payload. The webhook is the only writer of `tier='premium'`. `test:stripe-webhook` exercises all four signature-rejection cases. |
| `getUserPlan()` gating — regressed to old free self-serve toggle? | **No regression** | `src/lib/actions/billing.ts`: `getUserPlan()` reads `subscriptions.tier` server-side (returns `"free"` when unauthenticated). `setTier()` **refuses every `tier==='premium'` write** — returns a message string, never writes premium, whether `billingEnabled()` is true or false. Downgrade to free is allowed, but if a live `stripe_subscription_id` exists it routes to the Customer Portal instead of flipping the row. `checkAiUsageAllowed` / `checkChatUsageAllowed` gate before the model call; admins bypass the cap. `npm run test:settings-wiring` → **45/45**, `npm run test:billing-limits` → **19/19**. |

---

## 9. Account & admin

| Item | Status | Evidence |
|---|---|---|
| `role='admin'` set for the founder account | **Yes** | `profiles`: `user_id fea0d4e4-be87-48a6-96bb-68b57f29f3a9` ("Adam Hammoud", `auth.users.email = adamhammoud09@gmail.com`, created 2026-08-08) → `role='admin'`. The only other account is `khammoud69@gmail.com` ("Karim Hammoud", `role='member'`). CHECK constraint on `profiles.role` = `{'member','admin'}` — note the app default is `'member'`, though CLAUDE.md/older docs reference `'member'` vs an older `'admin'` seed. |
| `/admin` reachable and shows real data | **Not verified live (auth-gated); backing data is real** | Can't load `/admin` without an admin session. Underlying tables the admin snapshot reads: `ai_analyses` 17, `symbol_directory` 75, `historical_prices` 68 199, `ai_scope_guard_log` 97 (42 real + 55 test), `waitlist` 4. The 2026-08-31 pass verified `is_admin('fea0d4e4…') → true` and `getAdminSnapshot()` non-null for that role; the role is still set (above), so that result should still hold. |
| CLAUDE.md founder identity mismatch | **Present (carried over)** | CLAUDE.md/memory identify the founder as `adamhammoud09@outlook.com`, which has **no app account**; the admin role is on `adamhammoud09@gmail.com`. Flagged in the 2026-08-31 pass, unchanged. |

---

## 10. 2FA

| Item | Status | Evidence |
|---|---|---|
| Real TOTP 2FA implemented, or still a placeholder | **Still a placeholder** | `src/components/settings/two-factor-panel.tsx` comment: "there is no TOTP enrolment, no recovery codes … When two-factor ships it will use an authenticator app (TOTP)". `src/components/settings/settings-tabs.tsx:53`: "2FA is never actually enrolled in this build (no TOTP, no second factor)". `user_settings.two_factor_status` CHECK constraint = `{'not_enrolled','requested'}` — there is no "enrolled" state in the schema. `setTwoFactorInterest()` only toggles between those two values (a "notify me when it ships" flag). No `mfa`/`totp`/`authenticator` enrolment code anywhere in `src/`. |

---

## 11. Org / codebase hygiene

| Item | Status | Evidence |
|---|---|---|
| Ruflo plugin prune down to "7 essential plugins" | **Does not match; 2 Ruflo plugins installed, both scoped to a stale worktree** | `~/.claude/plugins/installed_plugins.json`: exactly **2** plugins — `ruflo-core@ruflo` (0.2.6) and `ruflo-swarm@ruflo` (0.2.1), both installed 2026-09-02, both `scope: "project"` pointed at `D:\Adam\Coding\Cairn\.claude\worktrees\aug31-founder-punchlist` (a worktree path, not the main project). No plugins are scoped to the main Cairn project. `known_marketplaces.json` = `claude-plugins-official` + `ruflo`. I have no baseline for what "7 essential" were meant to be, so I can't confirm a prune "to 7" — what exists now is 2, mis-scoped. If "plugins" means bundled skills, see next row. |
| `CLAUDE.md` / `.claude/agents/` reflect the "current 15-agent org" | **They agree with each other, but describe an 11-agent org, not 15** | `.claude/agents/` = **11 files**: chief-of-staff, dev-lead, bug-finder, bug-fixer, feature-builder, codebase-organizer, design-lead, cfo-legal-advisor, cmo-strategist, social-media-manager, creative-designer. CLAUDE.md "Departments & agents" lists exactly these 11. `git grep` for "15 agent(s)" / "fifteen" across the repo → nothing. So the docs are internally consistent; the "15" in the request isn't supported by anything in the tree. |
| Skill cleanup | **A cleanup ran; 108 skill dirs remain** | Commit `8bcff28` (PR #49, 2026-09-02, "chore(skills): remove skills not relevant to Cairn") deleted ~443 lines across many `agent-browser-*` / `agent-architecture-audit` skill dirs. `git ls-files '.claude/skills/*/SKILL.md'` → **108** remain. |
| Dead-code / unused-file cleanup pass ran with real evidence | **Partial, with real evidence** | Commit `56c46ba` (PR #48, 2026-09-02, "chore(cleanup): remove confirmed-dead exports"): removes 6 exports each with a stated "zero references" finding — `getTickerDetail`, `rowDensityClass`, `isSymbolIngested`, `sectorLabel`, `marketHolidaysCoverUntil`, `validateNumber` — and cites test runs (market-hours 17/17, sector-vocabulary 27/27, billing 19/19). This is a targeted dead-*export* sweep, not the full "202 `src/` files" dead-*file* sweep the 2026-08-31 pass flagged as still outstanding (`src/` is now 206 TS/TSX files). |
| Repo hygiene — stray tracked files | **8 stale worktree gitlinks tracked** | `git ls-files '.claude/worktrees*'` → 8 gitlink entries (`agent-a7cf39cb…`, `agent-afac4fad…`, `aug30-remediation`, `dev-lead-cleanup`, `readiness-report`, `scan-report-2026-08-30`, `skill-cleanup`, `waitlist-page`) committed in `5bbb5ff`. Git worktree pointers do not belong in version control; should be `.gitignore`d. |

---

## 12. Housekeeping

| Item | Status | Evidence |
|---|---|---|
| Leftover test account deleted | **Yes / none present** | `auth.users` + `profiles` = 2 accounts only: `adamhammoud09@gmail.com` (admin) and `khammoud69@gmail.com` (member — a real person). No `@test.invalid` / throwaway account remains. |
| Test symbols deleted | **No obvious test symbols; one questionable holding** | `symbol_directory` (75 rows): nothing matching `test|fake|demo|xyz|foo|abc` in symbol or name. `holdings` (5 rows): AMZN, NVDA, ISRG, BTC (Adam), MSFT (Karim). `BTC` as a holding symbol is suspect — crypto elsewhere is `BTC-USD`, and `historical_prices` has 0 rows for either `BTC`/`BTC-USD`, so that holding renders with a null price. Possibly stale test data. `ai_scope_guard_log` retains **55 `is_test=true`** rows (of 97) — excluded from the 90-day purge by design, so they persist. |
| Migration ledger still reconciled (no new drift) | **New drift: migration 0036 applied to the live DB but not recorded in the ledger** | `supabase_migrations.schema_migrations` ends at `20260830213609 0035_scope_guard_log_retention`. The repo has `supabase/migrations/0036_email_send_log.sql`, and the live DB **has** `public.email_send_log` (with data — 16/1 sends) **and** `public.record_email_send(int)` — so 0036's objects were applied out-of-band (SQL editor / `execute_sql`) with no `schema_migrations` row. This is exactly what the 2026-08-30 reconciliation doc's "Convention going forward" says not to do. Also still present (pre-existing): duplicate migration number `0016` (`0016_fix_cron_project_ref.sql` + `0016_founder_feedback_pass2.sql`); pre-`0027` ledger `name` values diverging from file basenames. |

---

## Everything confirmed broken or missing

- **Waitlist confirmation is completely broken in production.** `src/proxy.ts` exact-matches `publicRoutes`, so `/waitlist/confirm?token=…` `307`-redirects every unauthenticated visitor to `/waitlist` before the confirm RPC runs. 0 of 4 signups confirmed despite 17 confirmation emails sent. (§2)
- **`robots.txt` is not served in production** — `/robots.txt` `307`s to `/waitlist` (same `proxy.ts` root cause; `.txt` isn't in the matcher's asset exclusions). (§1)
- **`public/robots.txt` content is wrong for pre-launch** — reads `Allow: /` for all agents (and for `facebookexternalhit`), not `Disallow: /`. (§1)
- **CSP is still Report-Only**, not enforcing, on the live site. (§1, §6.4)
- **Supabase leaked-password protection is still disabled** (security advisor WARN). (§6.5)
- **`generate-daily-briefings` edge function is stale** — deployed 2026-08-30, missing the 2026-08-31 `dd079f5` briefing rewrite that is on `main`. Live cron briefings run old logic. (§4)
- **Cerebras LLM fallback is non-functional** — endpoint returns HTTP 402 "Payment required". (§3)
- **No working contact address** is published on the Privacy, Terms, or Accessibility pages. (§7)
- **ToS §12 (Governing law & disputes) is still an explicit placeholder.** (§7)
- **Account-deletion does not reach the AI provider (Groq)** — no per-record API exists; org-level Zero Data Retention is still an un-actioned founder item. (§7)
- **Migration ledger drift** — 0036 (`email_send_log`) is live but not in `schema_migrations`. (§12)
- **Stripe is built but inert** — `BILLING_ENABLED` is off, no keys, never run end-to-end; Test/Live mode is neither. (§8)
- **2FA is still a placeholder** — no TOTP, no enrolment, schema has no "enrolled" state. (§10)
- **Ruflo plugins are mis-scoped** — the 2 installed plugins point at a `.claude/worktrees/aug31-founder-punchlist` path, not the main project; no "prune to 7" is evidenced. (§11)
- **`CLAUDE.md` / `.claude/agents/` describe 11 agents, not the "15-agent org"** referenced in the request. (§11)
- **8 stale git-worktree gitlinks are tracked** under `.claude/worktrees/`. (§11)
- **`calendar_events` has only 2 rows** despite a daily ingest job reporting success — likely the function isn't writing. (§4)
- **`holdings` contains a `BTC` row** (not `BTC-USD`) with no price data — probable stale test data. (§12)
- **pg_net cron calls all log as timeouts** — `timeout_milliseconds: 5000` is far below the edge functions' runtime, so `net._http_response` is ~all timeouts and there is no real automated ingestion success/failure signal. (§4)
- **Waitlist `client_timezone` is never captured** — all rows have `''`; the form's `tz` field isn't reaching the row. (§2)
- **Privacy Policy overclaims "automated verification"** of the deletion cascade — the verification is a CI test, not a per-deletion check. (§7)

## Still genuinely unverifiable this pass — and what each needs

- **Deployed commit == `main` HEAD (`7c12462`).** No version/commit is exposed on any public route. Needs: Vercel dashboard deployment list, or a `/api/health` (or similar) that returns `NEXT_PUBLIC_BUILD_SHA`.
- **Browser console cleanliness; mobile-width (~375px) rendering of any page; visual confirmation of the form-field-wipe fix.** Needs: the Claude browser extension connected (it reported "not connected" this session), or a manual check.
- **Signed-in walkthrough: auth → portfolio → ticker page → AI assistant → Research against real data.** Needs: working test credentials for a non-admin and an admin account (self-serve signup is gated).
- **Live analysis generation for one equity + one crypto scope, writing real rows.** Needs: an authenticated session to POST to the generate path. (Existing rows show the pipeline has produced complete equity+crypto analyses; a fresh one wasn't triggered.)
- **Live end-to-end scope-guard probe** (prompts through `runChatTurn` against the live model). Needs: an authenticated session, or a fix to the `adversarial-scope-guard.ts` Tier-B harness so it doesn't hang on `llmHealthCheck()`/report-writing. (Deterministic gate is 100%.)
- **Model endpoint parity between local `.env.local` and Vercel production env.** Needs: Vercel env var read access, or an authenticated hit on the live `/api/chat`. (Primary Groq verified working from local with the shared creds.)
- **`/admin` renders real data in the browser.** Needs: an admin session. (Role is set; backing tables have real rows.)
- **Instagram / Facebook page bios' link-in-bio target.** Needs: access to the IG/FB pages or a manual check of each bio link.
- **Whether the "7 essential plugins" prune happened.** Needs: the intended list of 7. Current state: 2 Ruflo plugins, mis-scoped.
