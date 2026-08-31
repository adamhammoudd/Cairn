# 2026-08-31 founder punchlist — dev-lead report

**Branch:** `worktree-aug31-founder-punchlist` (pushed; **not merged** — per the
no-direct-commit rule, this ends with a PR for review).

Every "done" below has a real test run, build, DB query, or route-manifest
entry behind it. Items needing a human decision are called out, not resolved.

---

## 1. Settings page — match the mockup — **done** (`<settings commit>`)

Unblocked once the founder ran `/design-login`. Pulled `Cairn Settings.dc.html`
fresh from the Claude Design project (the same file the Research page import
used) and rebuilt the page to it — **header/top-nav left as-is per the task**.
The artboard is committed to `Context/mockups/`.

- New sticky underline **tab bar** (`settings-tab-bar.tsx`) replacing the
  nav-style grouped subheader (deleted); "2FA off" badge on Account.
- Shared **card primitives** (`settings-card.tsx`) with values transcribed
  from the mockup; one card per group, 14px gap.
- Exact mockup **toggle** (38×22, 16px knob, translateX 2→16).
- Every tab restructured into the mockup's multi-card layout; **every wired
  control kept** (`test:settings-wiring` 45/45).
- Account: two-column profile grid + verified chip; 2FA as the mockup card
  but with the honest "not available yet" body (**not** the mockup's fake QR
  enrolment — a working-looking 2FA screen is the worst placeholder); Danger
  zone with a typed-`DELETE` confirmation replacing `window.confirm`.
- Billing: the mockup's plan card (gradient + Premium glow) + usage card +
  payment history + footnote. Stripe wiring from item 3 unchanged.

**Deliberate deviations from the swatch:** `#6A6A6A` → `text-dim` (`#7B7B7B`)
for contrast (`test:contrast` is gating); the mockup's *illustrative* control
set (per-notification-type toggles, "improve models with my data",
session-history retention, product-analytics) is replaced with the real wired
controls — the page's own standing promise is "nothing here is a placeholder".

**Verification:** `tsc` + `next build` + `eslint` clean; `test:settings-wiring`
45/45. Value-level transcription, not a rendered screenshot — the same bar the
Research page import (`4bf0f0f`) met, since a logged-in page can't be captured
from here.

## 2. Chart fixes

### 2.1 — 1W hourly detail — **data-source gap, for chief-of-staff**

`historical_prices.ts` is a Postgres **`date`** column. There is no other price
table. **Hourly/intraday granularity has never been ingested for any symbol and
cannot be, given the schema.** The 1D/1W charts fetch intraday bars live from
the provider on demand (`getIntradaySeries` → Yahoo's chart endpoint) and never
store them.

The provider is Yahoo Finance's keyless chart API, which *does* expose intraday
(`interval=1m/5m/15m/60m`, 60m up to ~730 days, 1m last ~7 days) at no cost — so
"provider tier" is not the blocker. Adding stored 1W-hourly detail would need: a
timestamped intraday table (or a `granularity` column + type change), a separate
intraday ingest job, and chart wiring — roughly 1–2 days. **Whether it's worth
doing pre-launch is a chief-of-staff call.** The live-fetch path already gives
1D/1W a real curve for any symbol the provider covers.

### 2.2 — Closed-market display — **fixed** (`53bf142`)

`getIntradaySeries` / `getIntradayPortfolioSeries` filtered bars with
`Date.now() - t <= spanMs`, so over a weekend/holiday every bar the provider
returned was discarded → the 1D/1W chart rendered "No intraday bars for this
range". Now the window is anchored to the **newest bar** (new
`lib/intraday-window.ts`), so a closed market shows its last session — like
Yahoo Finance — and the card label switches from "Live · 1 min bars" to
"Delayed · 1 min bars · close of <date>". `test:intraday-window` — 13/13.

### 2.3 — Date shown on graphs — **fixed** (`53bf142`)

`historical_prices.ts` serialises as `"2026-08-28"`; `new Date("2026-08-28")` is
UTC midnight, and the chart components are client components, so
`toLocaleDateString()` rendered the **previous calendar day** for any viewer
west of UTC — the axis tick and tooltip disagreeing with the "as of <date>"
label above them. New `lib/chart-dates.ts` (`formatChartLabel`,
`formatTooltipLabel`) pins date-only values to UTC; intraday timestamps stay
local. Wired into `xAxisConfig` and all three chart tooltips (ticker, portfolio,
comparison). `test:x-axis` extended — 34/34.

## 3. Stripe integration (Phase 12) — **built, not yet run end-to-end** (`b2a6d1d`)

No prior Stripe spec existed (README + the 30 Aug audit both say billing was
unbuilt); built from the roadmap Phase 12 outline. Full runbook:
`docs/stripe-integration-spec.md`.

- `lib/stripe.ts`, `api/stripe/webhook` (signature-verified — bad/absent/
  tampered sig → 400, no writes), `lib/actions/checkout.ts` (checkout + portal,
  Stripe-hosted only), Billing UI wired, `billingEnabled()` now also requires a
  configured key.
- The **webhook is the only writer of a premium tier** — an abandoned or forged
  checkout grants nothing.
- Schema was already Stripe-ready; only the types file needed the columns.
- `test:stripe-webhook` — 10/10 (status→tier map, signature rejection). `tsc` +
  `next build` clean; `/api/stripe/webhook` in the route manifest.

**Needs (founder):** a Stripe account → test-mode `STRIPE_SECRET_KEY`,
`STRIPE_PRICE_PREMIUM`, `STRIPE_WEBHOOK_SECRET`, then the §3 local run in the
spec; live keys only after that passes. Also **chief-of-staff sign-off to pull
Phase 12 forward** per the roadmap's "don't reorder phases" rule.

**Post-review (2026-08-31, `<review commit>`):** checked the integration against
the founder's detailed requirements. One real gap found and fixed — `setTier()`
would have allowed a single free premium upgrade the moment `BILLING_ENABLED`
flipped to `true` (its guard was `!billingEnabled()`); it now refuses **every**
premium write, and refuses a downgrade too while a live Stripe subscription
exists (routing to the Customer Portal so Stripe is actually cancelled).
Webhook pinned to the `nodejs` runtime. Everything else in the requirements
list already held — see the review table in `docs/stripe-integration-spec.md`
§4a. `STRIPE_PUBLISHABLE_KEY` is intentionally unused: the integration is
hosted Checkout + Portal, so there is no client-side Stripe.js.

## 4. Admin account — **done, verified**

`profiles.role` set to `admin` for `adamhammoud09@gmail.com` (user_id
`fea0d4e4-…`, "Adam Hammoud", created day 1, last sign-in 30 Aug — the founder's
own active account). **Note:** CLAUDE.md identifies the founder as
`adamhammoud09@outlook.com`, which has **no app account**; only the gmail
address and one other exist in `profiles`. The task explicitly named the gmail
address and it is unambiguously the founder's — proceeded.

Verified: `select public.is_admin('fea0d4e4-…')` → `true`. `getAdminSnapshot()`
returns non-null for that role, so `/admin` no longer `notFound()`s, and the
tables behind it have real rows (16 analyses, 75 directory rows, 41,032 bars).

## 5. Expand analysis coverage — **DROPPED (founder: "remove perplexity api integration")**

Not started, and now not planned. No Perplexity code was ever added (the item
was on hold), so there is nothing to remove — this section is closed. The
completeness gate ("not enough historical data") stays exactly as designed;
tickers that fail it continue to show the honest message. If coverage is
revisited later it would be a fresh scoping exercise, not this item.

## 6. Portfolio holding links — **done** (`558ece6`)

Each holding's ticker symbol is now a `next/link` to `/ticker/[symbol]` in both
the desktop table and the mobile card, matching the watchlist/screener/markets
pattern. `tsc` + `next build` clean.

## 7. Improve daily briefings — **done** (`dd079f5`)

Root cause of the thin briefings: the generator only read validated analyses,
calendar events, and category-filtered news — and the category filter is empty
by default, so most briefings had no news at all, and price movement was never
looked at.

- Added last-session price moves (≥2%, from `historical_prices`) — real closes.
- Added news whose `tickers` overlap the reader's holdings/watchlist,
  independent of the category filter.
- `composeBriefingSummary()` extracted + tested (`test:briefing-summary`, 8/8).
- Rendered in `briefing-card.tsx`; Deno mirror updated (deploy separately).

Still improves further once item 5 lands more analyses.

## 8. Chatbot response formatting — **done** (`3f3d2a0`)

Reverses the prior "plain prose only" decision. New dependency-free markdown
parser (`lib/ai/markdown.ts`) + renderer (`markdown-message.tsx`): headings,
bold, lists, and **working source links (new tab, scheme-checked)**.
`reply-format.ts` no longer flattens markdown — it only flattens pipe tables
(no room in a 660px column). System prompt relaxed to permit light structure,
compliance rules unchanged. The methodology `<Disclosure>` and `MethodologyCard`
still render as siblings — untouched. Tests: `reply-format` rewritten 14/14,
new `markdown-render` 14/14.

## 9. Codebase cleanup — **partial** (`eb17944`)

- Corrected stale "SELF-HOSTED model / no third-party API" comments in
  `lib/ai/generate.ts` + `analytics.ts` (contradicted `llm.ts` + reality).
- Removed tracked cruft: `manifest.json` (0 bytes, dead), `dev-server.log`
  (committed log); `*.log` added to `.gitignore`.
- `gen:icons` was documented but `sharp` wasn't a dependency — added it; ran the
  script: PNG/ICO set **byte-identical** (confirms committed icons match
  `cairn-mark.svg`), only `icon.svg`'s stale comment updated.
- **`tsc --noEmit` clean** (after `next typegen`), **`eslint` clean** on all
  touched files, **`next build` exit 0** with every item above applied.
- A broader dead-code sweep across all 202 `src/` files was not completed this
  pass — flagged for a follow-up.

## 10. Unified logo — **audited, consistent** (`eb17944`)

`public/cairn-mark.svg` is the single source. Verified identical geometry +
gradient across `logo.tsx`, `src/app/icon.svg`, `cairn-mark.svg`. All 5
`<Logo>` call sites (auth, waitlist, waitlist/confirm, top-nav, legal-shell) go
through one component. `site.webmanifest` references the current icons. No email
templates in-repo (Supabase auth emails are dashboard-configured). The rasters
regenerate byte-identical from the SVG. **One gap fixed:** `sharp` was missing
so the documented regen workflow was broken.

## 11. Sign-out button colour — **RESOLVED (founder: "no red button")**

The sign-out button stays neutral — `text-muted → hover:text-primary` in
`top-nav.tsx`, consistent with the other menu items and with the brand rule
that reserves red for loss/destructive indicators. No code change; the
original "make it red" request is withdrawn.

## 12. Incoherence sweep — findings

**Fixed silently (safe):**

- `generate.ts` / `analytics.ts` "self-hosted model" comments → item 9.
- Dead `manifest.json`, committed `dev-server.log` → item 9.
- `src/app/icon.svg` claimed to be "the single source" when
  `cairn-mark.svg` is → item 9/10.

**Resolved (founder: "capped") — fixed in `<copy commit>`:**

- **Premium analyses stay capped** at `TIER_LIMITS.premium.monthlyAiAnalyses`
  (100). The contradicting "unlimited" copy is corrected:
  `research-workspace.tsx` and `research-states.tsx` now say Premium *raises*
  the monthly cap (and drop the nonsensical "upgrade for unlimited" shown to a
  Premium user — those blocks are gated to Free now); the **waitlist page**
  swaps "Unlimited research runs / Premium removes the cap" for "Unlimited
  chat" + "a much larger analysis quota". `positioning.md` was already correct
  ("unlimited **chat** + full methodology depth") and is unchanged. The only
  remaining "unlimited" strings are about chat, which genuinely is uncapped on
  Premium (`dailyChatMessages: null`).

- **`docs/decisions/2026-08-20-model-provider.md`** still frames "A. Self-hosted
  small model" as "the current design" and quotes a privacy blurb ("Self-hosted
  AI model. Cairn calls no third-party model API") that is no longer true and is
  internally inconsistent with line 11 of the same doc. It's a historical
  decision record superseded by `2026-08-30-groq-fallback-endpoint.md` — a
  doc-owner should add a "superseded" header rather than rewrite it.

## 13. Rename "Cairn" → "Cairn AI" — **dropped** (founder: "forget about it")

## 14. Staging / PRs

One branch, seven reviewable commits (`558ece6` → `b2a6d1d`). PR against `main`
listed in the session report. Not merged by the agent, per the standing rule.
