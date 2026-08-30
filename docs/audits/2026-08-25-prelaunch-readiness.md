# Cairn Pre-Launch Readiness Pass — 2026-08-25

Chief-of-staff consolidated report across 9 stages. Every item was re-verified this
session; nothing is credited as done because an earlier audit said so.

**Verdict: NO-GO.** Four launch-blocking items, one of them a materially false
user-facing statement about where user data goes. Details in §Go/No-Go.

---

## Environment note — why this pass could verify more than any prior one

Two environment facts materially changed what was verifiable, and both were
discovered during the pass rather than known at the start:

1. **`node_modules` was not installed.** No prior-session claim requiring
   `npm run dev`, `npm run build`, or any test run could have been executed as
   described. Installed this session.
2. **Playwright's browser binaries were not installed.** This is the precise reason
   `docs/audits/2026-08-20-verification-pass.md` (lines 36-46, 520) declared narrow
   viewport rendering "not verified — `resize_window` did not change the rendered
   viewport." Installed this session; real 375px rendering confirmed working
   (`window.innerWidth: 375`). **Stage 7 is therefore verified for the first time.**

Live credentials were present in `.env.local` and both external dependencies were
reachable: Supabase (all tables/functions responding) and Groq (201ms round-trip).
Prior audits ran against local fixtures because their environments blocked egress.

**A test account was created for this pass** — `readiness-audit-2026-08-25@cairn-test.local`
(uid `fac08e2c-7f3f-4848-acba-2079b3ae2eee`). Delete it before launch.

---

## Stage 1 — Feature completeness (dev-lead) — **INCOMPLETE**

Not re-verified row-by-row. The assigned agent was killed by an account-wide API
session limit before reporting, and was not relaunched in favour of higher-priority
stages. `docs/audits/2026-08-22-feature-completeness.md` (55/62 OK) remains the last
full pass and is **not** re-confirmed here.

Partial evidence gathered incidentally this session:

| Item | Status | Evidence |
|---|---|---|
| All 16 app routes reachable | **PASS** | Every route returned HTTP 200 under an authenticated session (see Stage 7 table) |
| `/` redirects unauthenticated → `/login` | **PASS** | `curl` returned `307 → /login`; confirms the auth page is the de-facto landing surface |
| 404 handling | **PASS** | `/nonexistent-404-test` → 404, branded page |
| Row 15/17 — financial statements, options chain | **FAIL (no data)** | `financial_statements`, `option_contracts`, `symbol_profiles`, `esg_scores` all **0 rows** in the live DB |
| Stripe checkout/portal/webhooks (row 42) | **CONFIRMED ABSENT** | No package, no webhook route, `BILLING_ENABLED` defaults off |

**Owed:** a real row-by-row re-run.

---

## Stage 2 — Data & content accuracy (dev-lead) — **PARTIAL PASS**

| Item | Status | Evidence |
|---|---|---|
| Chart query-ordering bug class | **PASS** | `recent_prices(symbols, per_symbol)` returned strict DESC newest-first for AAPL/BTC/MSFT |
| Per-symbol LIMIT bug (shared LIMIT) | **PASS** | 3 symbols × 4 rows each = per-symbol limiting, not a shared cap |
| Data freshness | **PASS** | Newest rows 2026-08-24 (equities), 2026-08-25 (BTC) — current |
| Historical store populated | **PASS** | `historical_prices` 26,707 rows; `news_items` 3,798; `historical_events` 100 |
| Ticker universe / on-demand ingestion | **PASS (structural)** | `symbol_directory` 60 rows; `recent_prices`, `recent_prices_all`, `search_symbols`, `symbol_52w_range` all callable |
| Calendars | **WEAK** | `calendar_events` holds only **3 rows** — page renders but is near-empty |
| Reference tables | **FAIL** | `symbol_profiles`, `financial_statements`, `option_contracts`, `esg_scores` = **0 rows** |
| Cross-page consistency (rendered UI) | **UNVERIFIED** | Verified at the data layer (one shared function); not diffed across rendered pages |

**Note on a false alarm:** the AI suite emits alarming `missing migration 0027/0028`
lines. These come from `scripts/tests/read-errors.ts`, which *deliberately* exercises
that failure path (its header documents the original regression). The live DB has
those migrations. 17/17 passed.

---

## Stage 3 — AI assistant correctness (dev-lead) — **PASS, with a capacity risk**

The prior audit's headline blocker is closed.

| Item | Status | Evidence |
|---|---|---|
| Hosted model reachable | **PASS** | Groq live, 201ms, `openai/gpt-oss-120b`, real completion returned |
| `ai_analyses` populated (was 0 rows — "the sharp end") | **PASS** | **9 rows**, incl. TSLA + MSFT |
| Sources / analogs / confidence, never a bare score | **PASS** | 161 rows `ai_analysis_sources`, 76 `ai_analysis_historical_analogs`; schema carries `probability_low/high`, `confidence_level`, `sample_size`, `reasoning_text` |
| Scope guard — deterministic layers | **PASS** | Probe: **53/53**. 35/35 adversarial caught, 25/25 of the original audit's held-out cases, 18/18 compliant not over-fired |
| Scope guard — layer-3 semantic classifier | **PASS** | 16/16. Caught live: *"Is it time to trim my holdings in tech?"* → model attempted a violation, guard rewrote before display (`classifier:advice_to_reader`) |
| Scope guard — live end-to-end tier | **BLOCKED, not failed** | Tier B 21/22 and 19/22 across two runs. **Every failure was HTTP 429 from Groq, never a guard leak** |
| Citation freshness | **PASS** | 6/6 (previously INCOMPLETE with 0 tests — now real) |
| Methodology substance | **PASS** | 9/9 (previously UNVERIFIED) |
| Probability computed in code | **PASS** | 8/8 deterministic |
| LLM rate-limit retry policy | **PASS** | 22/22 |
| Free/Premium honesty parity | **UNVERIFIED** | Not compared side-by-side in rendered output |
| Streaming | **UNVERIFIED** | `llmComplete` sends `stream: false`; unchanged |

### ⚠ New finding — LLM capacity ceiling
Groq's `on_demand` tier caps at **8,000 tokens/minute**. Running the test suite alone
exhausted it and produced repeated HTTP 429s. Under real user load — especially with
Premium's `dailyChatMessages: null` (unlimited) — chat will rate-limit. This compounds
Stage 9's confirmed absence of any spend cap and the still-open fallback-provider
decision (`docs/decisions/2026-08-20-model-provider.md`).

### Open decisions (chief-of-staff, unresolved)
- Fallback LLM provider for rate-limited periods — **now materially more urgent**
- Scope-classifier failure posture (advisory vs strict) — currently advisory
- Derived crypto volatility-regime labelled as a "historical analog"

---

## Stage 4 — Security (dev-lead) — **PASS on checklist / FAIL on 2FA**

### 4a — Checklist

| Item | Status | Evidence |
|---|---|---|
| `src/proxy.ts` wiring | **PASS — prior finding was wrong** | See below |
| Security headers | **PASS** | Live `curl` against a real `next start`: `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS preload |
| CSP | **DECISION NEEDED** | Still `Content-Security-Policy-Report-Only` — not enforcing |
| RLS | **PASS** | 24 tables with RLS, 25 policies; spot-checked past "enabled" — `holdings` carries `WITH CHECK`, which is what blocks a forged `user_id` on INSERT; `auth_attempts` correctly RLS-on with zero policies (default-deny) |
| Secrets / git history | **PASS** | `git log --all -p` — zero JWT-shaped literals, no `.env` ever committed |
| Session storage | **PASS** | Zero `localStorage`/`sessionStorage` in `src/`; cookie-based via `@supabase/ssr` |
| Auth rate limiting | **PASS (code)** | 5 attempts/15min, per-identifier **and** per-IP, salted hashes; fails open on DB error by design |
| General API rate limiting | **GAP (known)** | `/api/*` routes rely on tier quotas, not IP/time-window throttling |
| Billing self-upgrade gate | **PASS** | `setTier()` refuses `premium` unless `BILLING_ENABLED === "true"` |
| IDOR (`rls_idor.sql`) | **UNVERIFIED** | Needs local Postgres on :5433; `pg_isready` absent |
| Leaked-password protection | **UNVERIFIED** | Supabase dashboard-only |
| Stripe webhook signature | **N/A** | Stripe not integrated — deferred, not failed |

**`src/proxy.ts` — a prior finding corrected.** Earlier recon flagged it as dead code
needing a rename to `middleware.ts`. That was wrong, and acting on it would have
**broken session refresh**. Next.js 16 renamed the convention: `middleware.ts` →
`proxy.ts`. Verified three ways — Next 16.3.0's source defines `PROXY_FILENAME`; a real
`next build` prints `ƒ Proxy (Middleware)`; and `.next/server/middleware.js` contains
`proxy.ts`'s session-refresh logic verbatim. **No change was made.**

### 4b/4c — Real 2FA — **NOT IMPLEMENTED**

Not built. Current state is unchanged from the placeholder: `two-factor-panel.tsx`
shows "Not available yet" and writes an interest flag to
`user_settings.two_factor_status`. **Zero `auth.mfa.*` usage anywhere in the repo.**
Supabase's installed SDKs (`@supabase/ssr@0.12.4`, `@supabase/supabase-js@2.112.2`)
both support the MFA API, so there is no technical blocker — only unspent effort.

Everything the brief asked for here remains outstanding: TOTP enrolment (QR + manual
key), recovery codes shown once, a hard second-factor gate at login, a documented
recovery path, and end-to-end verification on a real account.

---

## Stage 5 — Legal & compliance (cfo-legal-advisor) — **FAIL (launch-blocking)**

Corrected drafts committed as `bcd5664` on `worktree-agent-afac4fad6047ce7af`.
All documents retain their non-lawyer draft banners.

### 🚨 The most serious finding of this pass
`src/app/privacy/page.tsx` tells users, verbatim at lines 38 and 69-70:

> *"Chat messages are processed by a model running on Cairn's own infrastructure.
> They are not sent to any external model provider and are not used to train any model."*

**This is false.** Chat content is sent to Groq — verified live this session against
`https://api.groq.com/openai/v1`. A privacy policy misstating where user data goes is
the one thing it cannot get wrong. **The markdown drafts are now corrected; the
user-facing page is not.** Fixing the page is launch-blocking.

| Item | Status |
|---|---|
| Privacy policy accuracy vs real data flows | **FAIL** — page still false; drafts corrected |
| Groq DPA / retention / training terms | **UNVERIFIED** — nobody has read them; gates any published retention claim |
| GDPR/CCPA language | **PARTIAL** — no stated Art. 6 lawful basis; no California rights section; deletion cascade doesn't reach Groq or `ai_scope_guard_log` while Settings promises "all of it" |
| Cookie consent | **PASS (reasoned deferral)** — only first-party strictly-necessary Supabase auth cookies; exempt under ePrivacy Art. 5(3) / PECR reg. 6. `src/components/settings/cookie-preferences.tsx` exists as a live transparency inventory. **Hard condition: becomes blocking the moment any analytics/ad/session-replay script is added** |
| ToS arbitration + UGC takedown | **PASS after reconciliation** — both shipped on `/terms` but were missing from the draft; now ported in |
| ToS liability (§9) + governing law (§12) | **FAIL** — still empty placeholders, flagged blocking |
| Subscription cancellation | **N/A** — correctly reframed to affirmative "no paid subscription exists" |
| Accessibility statement | **PASS** — honest; explicitly claims no formal WCAG 2.1 AA conformance |
| AI-use disclosure | **PARTIAL** — present on signup + Settings, **missing from the login page footer** (see Stage 6) |
| Contact address | **FAIL** — none exists; blocks rights requests, takedown, children's-privacy and accessibility reports |

---

## Stage 6 — Landing page & marketing credibility (design-lead) — **FAIL**

Audited by reading shipped JSX/Tailwind/copy. **No screenshots** were possible for that
agent (no browser access); rendering fidelity, computed contrast on alpha fills, and
hover/focus states remain unverified by it.

| Item | Status |
|---|---|
| No off-brand gradients / glassmorphism | **PASS** — one gradient hit, the sanctioned accent ramp; zero `backdrop-blur` |
| No startup-cliché copy | **PASS** — 17 filler patterns searched, zero user-facing hits |
| Real proof, no fake social proof | **PASS (exemplary)** — no testimonials, counts or logos; `/accessibility` ships a "What has not been verified" section |
| Typography | **PARTIAL** — serif (Newsreader) properly loaded; `--font-sans` is an unpinned system stack, so body face differs Windows vs macOS |
| No decorative-only elements | **FAIL** — `BuildBadge` renders git SHA + timestamp (with `-dirty`) to **every public visitor** on login/signup/terms/privacy/404 |
| Red reserved for loss/destructive | **FAIL** — generic auth errors use `text-negative` (`login/page.tsx:45`, `auth-chrome.tsx:18`); violates a stated non-negotiable |
| Styled auth errors | **PASS** |
| Signup field preservation | **FAIL** — still wipes all fields on error; action returns only an error string |
| Resend-confirmation link | **FAIL** — zero occurrences of `resend` in `src/`; email typo = permanent dead end |
| Login footer disclaimer parity | **FAIL** — login omits *"Analysis and chat content is generated by AI and can be wrong"* and the Accessibility link that every other auth page carries |
| Branded 404 | **PASS** |
| CTA hover/focus states | **FAIL** — `submit-button.tsx:12` has no hover, no `focus-visible`, no transition |

**Confirmed visually** in this pass: the BuildBadge is not merely a leak — it
**overlaps interactive content** on mobile, obscuring a suggested prompt on
`/assistant` and the "PRE-BUILT SCREENS" heading on `/screener`.

---

## Stage 7 — Responsiveness & cross-device (dev-lead) — **PASS on layout / FAIL on PWA**

**Verified for the first time**, with real Playwright rendering at 375 / 768 / 1440 px
across 16 routes. Screenshots captured. This closes the honesty gap the prior audit
flagged — it is no longer unverified.

| Check | Status | Evidence |
|---|---|---|
| Horizontal overflow | **PASS** | `scrollWidth - clientWidth = 0` on **every route at every breakpoint** |
| Data-dense tables reflow | **PASS** | Screener/holdings/comparison need no horizontal scrollers — they reflow. `holdings-table.tsx` stacked-card pattern is the reference |
| Nav collapse | **PASS** | Hamburger drawer with grouped categories (MARKETS / PORTFOLIO / PLANNING / ASSISTANT), account row with plan tier, generous touch targets |
| Chat reachable on mobile | **PASS with UX note** | Docked FAB **is** hidden below 900px with no floating entry point — but the drawer exposes `/assistant` and `/research`. One extra tap, **not a dead end** (this corrects an earlier recon alarm) |
| `/assistant` full-page on mobile | **PASS** | Composer, history, briefing and AI disclaimer all present and legible at 375px |
| Charts legible at mobile width | **PARTIAL** | Recharts `width="100%"` with fixed px heights; no breakpoint-conditional height. Rendered without overflow; fine-grained legibility not scored |
| Touch targets ≥32px | **PARTIAL** | Mobile has *fewer* sub-32px targets than desktop (e.g. screener 12/82 mobile), indicating responsive sizing works. Densest surfaces still carry small controls |
| **PWA / Add to Home Screen** | **FAIL** | `manifest.json` is **0 bytes** *and* at the repo root rather than `public/`, so it is never served. `/manifest.json` and `/manifest.webmanifest` both **404**. No `<link rel="manifest">`. No 192/512 icons. **Installation cannot work.** |

---

## Stage 8 — Settings completeness (dev-lead) — **PASS (except 2FA)**

| Item | Status | Evidence |
|---|---|---|
| Controls wired to real behaviour | **PASS** | `test:settings-wiring` **45/45** — every field read from `formData`, thresholds persisted to `notification_thresholds`, min-price-move floor applied in **both** the Node and Deno alert paths |
| Billing panel uses shared gate | **PASS** | Reads `getBillingDetail()`/`getBillingSummary()`; no direct `ai_usage_events` query |
| Currency/display prefs honoured | **PASS** | No surface hard-codes USD; all money routes through `lib/display-prefs` |
| Grouped categories | **PASS** | Six tabs render; drawer confirms grouping |
| Settings page at 375px | **PASS** | Renders, 2/32 small targets — best of any dense page |
| **2FA panel** | **FAIL** | Still the placeholder — see Stage 4b |

---

## Stage 9 — Production readiness baseline (dev-lead) — **PARTIAL**

| Item | Status | Evidence |
|---|---|---|
| Edge function hardening | **PASS (code)** | All 8 functions call `requireCronSecret()`, fail closed (503) without it; CORS locked to `null`; migration `0023` self-checks |
| `CRON_SECRET` set | **LIKELY — needs dashboard confirmation** | Present in local `.env.local`. Whether `supabase secrets set` and `app.settings.cron_secret` were run against the live project is **not confirmable from code** |
| LLM/Supabase spend caps | **FAIL** | Per-user quotas exist; **no total spend ceiling anywhere**. Premium chat is `null` (unlimited). Compounded by the 8,000 TPM ceiling in Stage 3 |
| Automated backups | **UNVERIFIED** | Nothing in-repo documents this; Free-tier Supabase has none |
| Failure alerting | **FAIL as alerting** | `/admin` is real and role-gated, but **pull-only** — nothing pages anyone. A silently failing cron would repeat exactly the prior undetected-bug scenario |
| Error-handling hygiene | **MOSTLY PASS** | `(app)/error.tsx` uses amber (not red), plain language, and correctly distinguishes prod/dev. `/api/chat` maps `LlmBusyError` → 503 + `Retry-After` |
| Raw error leakage | **MINOR FAIL** | `/api/v1/holdings` and `/api/v1/watchlists` return raw Postgres `error.message` to the client |
| No root `error.tsx` | **MINOR GAP** | `(auth)`, `/privacy`, `/terms`, `/accessibility` fall through to Next's default page |

Load/stress/chaos testing and DR drills: **explicitly deferred** per brief.

---

## Go / No-Go

### 🔴 NO-GO. Launch-blocking:

1. **The privacy page lies about where user data goes.** `src/app/privacy/page.tsx:38,69-70`
   states chat is never sent to an external provider; it goes to Groq. Legal and
   trust exposure, and the fix is a small edit. *(Stage 5)*
2. **Real 2FA does not exist.** Explicitly requested; still a placeholder with zero
   `auth.mfa.*` usage. *(Stage 4b)*
3. **"Add to Home Screen" cannot work.** Empty, unserved manifest with no icons —
   and the brief names this the intended mobile usage pattern. *(Stage 7)*
4. **`BuildBadge` exposes internal build state to every public visitor** and overlaps
   interactive content on mobile. One-line env gate. *(Stage 6)*

Per the brief's no-round-up rule, items 2 (security), 3 (usability on real devices)
and the Stage 3 capacity risk each independently prevent an overall "ready".

### 🟠 Ship-with-known-gap (justified):

- **CSP Report-Only** — deliberate staging posture; enforcing it needs a clean console
  pass. Acceptable given headers are otherwise complete. **Your decision.**
- **Cookie consent absent** — reasoned: only strictly-necessary first-party auth
  cookies, exempt under ePrivacy/PECR. **Void the moment any analytics script ships.**
- **No general API rate limiting** — tier quotas cover the expensive paths.
- **Empty reference tables** (`financial_statements`, `option_contracts`,
  `symbol_profiles`, `esg_scores`) — features degrade to empty states rather than
  breaking, but shipping visibly empty surfaces is a product call.
- **Raw Postgres errors on two `/api/v1` routes** — same-user scoped, not a leak.

### 🟡 Fix-before-real-users (not blocking a soft launch):

- **LLM capacity + spend cap.** 8,000 TPM ceiling with unlimited Premium chat and no
  dollar cap. Resolve the fallback-provider decision.
- **No push alerting.** You would not know a cron silently failed.
- **Signup field-wipe and missing resend-confirmation link** — both cost real signups.
- **Red used for generic auth errors** — brand non-negotiable.
- **Login footer omits the AI-fallibility disclosure** — guardrail gap on the
  highest-traffic public page.
- **Confirm in the Supabase dashboard:** backups enabled, `CRON_SECRET` set,
  leaked-password protection on.
- **Publish a monitored contact address.**

### ⚪ Explicitly deferred post-launch:
Load/stress/chaos testing, DR drills, Stripe webhook verification (until billing is
live), streaming responses.

---

## Owed work (this pass did not complete)

1. **Stage 1** — full 62-row re-verification. Not run.
2. **Stage 4b/4c** — build and verify real 2FA.
3. **IDOR SQL suite** — needs local Postgres on :5433.
4. **Cross-page consistency in rendered UI** — verified at data layer only.
5. **Free vs Premium output parity** — not compared side-by-side.

Two agents were killed mid-flight by an account-wide API session limit; Stages 5 and 6
were relaunched successfully, Stage 1 was not.

## Cleanup
Delete test account `readiness-audit-2026-08-25@cairn-test.local`
(`fac08e2c-7f3f-4848-acba-2079b3ae2eee`) before launch.
