# 2026-08-31 founder punchlist — dev-lead report

**Branch:** `worktree-aug31-founder-punchlist` (pushed; **not merged** — per the
no-direct-commit rule, this ends with a PR for review).

Every "done" below has a real test run, build, DB query, or route-manifest
entry behind it. Items needing a human decision are called out, not resolved.

---

## 1. Settings page — match the mockup — **BLOCKED**

The design-import method (used for the Research page, commit `4bf0f0f`) pulls a
fresh `Cairn.dc.html` from the Claude Design project via the DesignSync MCP.
That MCP needs `/design-login`, which can only run in an interactive session —
a background job can't authorize it. The local `Context/mockups/Cairn.dc.html`
is truncated at exactly 256 KiB (ends mid-array), so it carries no complete
Settings artboard to work from.

The founder said the mockup is "on the google chrome browser", but the browser
extension only exposes its own tab group, not the founder's other tabs.

**Needs:** the founder to run `/design-login` in an interactive Claude Code
session, **or** paste the Settings mockup URL, **or** drag that tab into the
Claude side panel. Then this is a straightforward pixel pass. Nothing shipped.

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

## 5. Expand analysis coverage — **ON HOLD (founder's call)**

The founder chose to wait for a Perplexity API key rather than use the
web-search fallback. Not started. The item 7 briefing check that depends on it
was done for the parts that don't (price/news wiring).

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

## 11. Sign-out button colour — **NEEDS A HUMAN DECISION — not implemented**

Current: `top-nav.tsx` renders "Sign out" as `text-muted → hover:text-primary`,
a neutral treatment consistent with the other menu items. The request to make
it **red** conflicts with the standing brand rule ("red reserved exclusively
for loss/destructive indicators"), enforced everywhere else (the delete-holding
button is the only red control in that menu). **Do not implement until
`design-lead` or the founder confirms** whether this is an intentional
exception or should get a neutral/outline treatment instead.

## 12. Incoherence sweep — findings

**Fixed silently (safe):**

- `generate.ts` / `analytics.ts` "self-hosted model" comments → item 9.
- Dead `manifest.json`, committed `dev-server.log` → item 9.
- `src/app/icon.svg` claimed to be "the single source" when
  `cairn-mark.svg` is → item 9/10.

**Needs a product decision — NOT fixed:**

- **Premium "unlimited runs" vs the 100/month cap.** `TIER_LIMITS.premium
  .monthlyAiAnalyses = 100`, but `/billing`, `research-workspace.tsx`
  (`"Upgrade for unlimited runs"`), `research-states.tsx` (`"Upgrade for
  unlimited"`) and the **waitlist page** (`"Unlimited research runs — Premium
  removes the cap"`) all promise unlimited. `Context/positioning.md` only
  promises "unlimited **chat** + full methodology depth" — silent on an
  analysis cap. And `research-workspace.tsx:250` shows a Premium user at their
  cap the line *"Upgrade for unlimited runs"* — there is nothing to upgrade to.
  **Decision needed:** is Premium analyses unlimited (set the limit to `null`,
  keep the copy) or capped at 100 (fix every "unlimited" string)? Then align
  code + all copy in one pass, or item 12 has just created its own
  contradiction.

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
