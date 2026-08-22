<title>Feature Completeness Audit</title>

# Cairn - feature-completeness audit

**Run by:** dev-lead · **Date:** 2026-08-22 · **Branch:** `claude/ticker-coverage-chart-accuracy-bvw3og`
**Checklist:** `Context/build-roadmap.md`, plus `Context/first-revision.md` (founder
feedback pass) and `Context/ai-assistant-rebuild.md` (consolidated AI spec).

This asks a different question from the correctness audits: does every intended
feature **exist and can a real user reach it**. Every row below was exercised in
a browser against a running app - logged in, clicked through, and checked
against the database where a write was involved. Nothing is marked present
because a file exists.

## How this was run

Same local stack as the 2026-08-22 chart pass: Postgres built from the
committed schema and migrations, a PostgREST/GoTrue-compatible shim, the real
app, driven in Chromium via Playwright as a logged-in user. Fixtures were
inserted for news, calendar events, historical events, analyses and discussion
so the surfaces that render ingested data had something to render - the
ingestion pipelines themselves were verified in the 2026-08-20 pass and are not
re-audited here.

**Two things could not be exercised in this session**, both environment limits
rather than findings:

- **The LLM is unreachable** (egress policy blocks Groq), so anything that
  calls the model at runtime - chat replies, analysis *generation*, inline
  chat-triggered generation - could not be run. Their display surfaces were
  verified against stored records, and the failure path was verified (see the
  chat row). Generation itself was verified in the 2026-08-21 AI-spec pass.
- **No payment processor is configured** (`BILLING_ENABLED` unset), which is a
  deliberate pre-launch state the app discloses in its own UI.

## Spec-coverage note, needs chief-of-staff

Five items on the audit checklist appear in **no spec document in this
repository** - not `build-roadmap.md`, not `first-revision.md`, not
`ai-assistant-rebuild.md`: the trending-ticker carousel, the company-profile
tab, financial-statement tabs, technical-indicator overlays, and the options
chain. Pre-built screens (Day Gainers/Most Active/52-Week Highs) and the 2FA
placeholder are likewise absent from all three. The phase numbering in the
checklist also differs from `build-roadmap.md` (its Phase 3 is Portfolio, not a
feature matrix). They are reported below as **Missing** because the app does not
have them, but whether they are in scope is a decision, not an engineering
finding - there may be a spec version this repo does not carry.

---

## The table

Status key: **OK** = present & working · **PARTIAL** = present but
broken/incomplete · **MISSING** = no implementation · **UNCLEAR** = scope
ambiguous, needs a decision.

| # | Feature | Phase | Status | What was actually checked |
|---|---|---|---|---|
| 1 | Dark canvas, header/search/avatar alignment | 1 | **OK** | Every route rendered at 1500px; header is one row, canvas `#0A0A0A`, avatar + plan chip aligned. |
| 2 | Settings sub-header + grouped categories | 1 | **OK** | Clicked all five tabs (Display, Account, Notifications, Billing, AI Assistant); each renders its own panel under a shared sub-header. |
| 3 | **Settings persistence (Supabase synced)** | 1 | **PARTIAL** | Selected currency EUR → **Save changes** → DB still `USD`. No "Saved." and no error rendered. Reproduced on a **production build**. Server log: `updateSettings(null, {})` - the action receives an empty FormData although the POST body carries `_1_currency=GBP`. |
| 4 | Auth: signup / login / password reset | 1 | **OK** | All four routes render with the right fields; logged in and out through the UI for every other test in this audit. |
| 5 | 2FA placeholder | 1 | **MISSING** | No mention of 2FA/MFA/authenticator anywhere in `src/`, and nothing on the login or Settings → Account panels. |
| 6 | Data export | 1 / 11 | **PARTIAL** | Settings → Account → Export downloads `cairn-account-data.json` (9,516 bytes, real account/profile/holdings). **JSON only - no CSV anywhere in the codebase**, and the spec says CSV/JSON. |
| 7 | Data delete | 1 | **OK (not executed)** | "Delete account" present with an explicit irreversible warning and a confirm dialog. I dismissed the dialog rather than destroy the audit account; the GDPR cascade is covered by `supabase/tests/gdpr_erasure.sql`. |
| 8 | Holding CRUD + custom purchase date | 2/3 | **OK** | Added TSM through the modal (positions 4→5) with `purchase_date = 2025-11-14`; deleted it (5→4). |
| 9 | "Edit Asset" modal | 2/3 | **OK** | Opened from a row; heading reads "Edit asset", pre-filled with symbol, type, quantity, price, purchase date, sector, asset class, geography, notes. (Escape does not dismiss it - Cancel does.) |
| 10 | Timeline-aligned chart, 1D–ALL | 2/3 | **OK** | Each range's drawn point count matched the window computed from the DB (1W 8/8 … ALL 539/539); 1D shows the honest no-intraday state. |
| 11 | Gain/loss, % return, cost basis | 2/3 | **OK** | Row and totals reconciled against the DB: AAPL 40 @ $232.14 → $12,629.20 value, +$3,343.60, +36.0%. |
| 12 | Allocation by sector / asset class / geography | 2/3 | **OK** | All three tabs render and re-split the same holdings. |
| 13 | Trending-ticker carousel / market deck | – | **MISSING** | Markets is a flat filterable table; no carousel/deck anywhere. Not in any spec doc in the repo (see note above). |
| 14 | Company profile tab | – | **MISSING as a tab** | Ticker page has a flat stat grid (P/E, EPS-derived market cap, volatility, next event) and an ESG panel, but no tabbed profile. Not in any repo spec doc. |
| 15 | Financial statements (income / balance / cash flow) | – | **MISSING** | Zero references in the codebase; `fundamentals` carries only shares outstanding, TTM EPS, TTM dividends. Not in any repo spec doc. |
| 16 | Technical overlays (SMA/EMA/RSI/MACD) | – | **MISSING** | No indicator maths anywhere. "SMA" appears only as an alert *type* label. Not in any repo spec doc. |
| 17 | Options chain | – | **MISSING** | No options data model, route or component. Not in any repo spec doc. |
| 18 | Multi-asset screener, debounced filtering | 4/7 | **OK** | Set min price 500 → match count fell 48 → 6 without a reload; asset-type pills, price/%/volume/cap/PE/yield filters all present. |
| 19 | Saved screens (Supabase-synced) | 4/7 | **OK** | Saved "Audit screen"; row persisted in `saved_screens` with the filter JSON, and it reappears after a reload with a delete control. |
| 20 | Multiple named watchlists | 4/7 | **OK** | Created "Defence & space" through the full-page flow; persisted with its description and redirected to /watchlists. |
| 21 | Drag-to-reorder + sparklines | 4/7 | **OK** | Dragged NVDA from position 1 to 3; `watchlist_items.sort_order` changed in the DB. Sparkline points match the DB's last 30 closes exactly. |
| 22 | Pre-built screens (Gainers/Losers/Most Active/52W) | – | **MISSING** | Screener offers only Reset filters / Save screen. Not in any repo spec doc. |
| 23 | Alert types (price, %, volume, crossover, AI confidence) | 5/8 | **OK** | The type selector offers all five, including the roadmap's "AI confidence" type. Created a price alert on AAPL @ 400; row persisted. |
| 24 | Alert management: edit / delete / pause | 5/8 | **OK** | Per-row icon controls. Paused one: `alerts.enabled` true → false. Edit re-opens pre-filled with type, scope, comparator, value, cooldown, channels. |
| 25 | Delivery channels (in-app / push / email) | 5/8 | **PARTIAL** | All three selectable per alert and stored. The Settings copy states push and email are "recorded but not delivered until a provider is wired" - honest, but only in-app actually delivers. |
| 26 | Cooldown / rate limiting | 5/8 | **OK (config verified)** | Per-alert cooldown selector (1/6/12/24h) persisted as `cooldown_seconds = 3600`. Firing itself is a scheduled Edge Function and was not triggered here. |
| 27 | Calendars: earnings, economic, dividend, IPO, split | 6/7 | **OK** | All five types render and filter. The filter is a multi-select toggle (empty = all), verified by cycling each type and watching the "next up" rail. |
| 28 | Ticker-specific + market-wide news | 6 | **OK** | /news lists market-wide with source and age; the ticker page carries its own filtered feed. |
| 29 | News relevance ranking | 6 | **OK (with a caveat)** | "Everything" leads with a holdings item; "Your holdings" and "Macro" filter correctly. "Your sectors" matches `holdings.sector` (free text the user types) against the tagger's sector vocabulary by exact string - it fires when they align (proved by setting a holding's sector to "Energy" and seeing the XLE item surface) but the two vocabularies are not reconciled. |
| 30 | Asset-type routing on ticker detail | 7/9 | **PARTIAL** | equity / etf / crypto / forex / index all badge correctly, and crypto swaps in rank + circulating supply. But forex and index fall through to the equity layout - `EURUSD` and `^GSPC` both render "P/E (TTM)" and "Next event". |
| 31 | Crypto folded into Markets; standalone page removed | 7/9 | **OK** | /crypto 307-redirects to /markets; crypto renders through the same row component as everything else, filterable by the Crypto pill. |
| 32 | Comparison, up to 4 tickers | 8/10 | **OK** | Requested five symbols; exactly four plotted on one shared timeline with a key-stat table. |
| 33 | Sector heat map | 8/10 | **OK** | 13 sectors; tile colour and intensity match each symbol's real daily change to three decimals. |
| 34 | Discussion threads + voting | 8/10 | **OK** | Posted a comment (2→3 rows). Voted: thread went 1/0 → 0/1 and the `discussion_votes` row flipped direction - one vote per user, switchable, counts derived. |
| 35 | Spam filtering | 8/10 | **OK** | Posted a spam-shaped comment; stored with `flagged = true` automatically and hidden from everyone but its author. |
| 36 | Manual moderation (report/flag control) | 8/10 | **MISSING** | No report/flag affordance in the UI. Moderation is automatic-only; a user cannot flag someone else's comment. |
| 37 | ESG score panel | 8/10 | **OK** | Renders on equity/ETF pages with E/S/G/total and an explicit "illustrative demo data, not a live ESG provider" label. |
| 38 | Calculators | 9/11 | **UNCLEAR** | Present and working: position sizing, scenario modelling, and a goal tracker (target value + date). The spec says "retirement/growth calculators" - what shipped is trading-oriented rather than retirement projection. Same-thing-or-not is a product call. |
| 39 | Documented `/api/v1/...` routes | 9/11 | **MISSING** | The only API route in the app is `/api/chat`. `/api/v1/holdings` 404s. |
| 40 | Admin / dev utility route (role-gated) | 9/11 | **MISSING** | No admin route, and no role gate anywhere in `src/` beyond the service-role client. `/admin` 404s. Nothing surfaces cron health, rate-limit usage, or engine health. |
| 41 | Free/Premium plan model | 10/12 | **OK** | Billing page shows both plans with their AI quotas and the current plan; `subscriptions` table backs it. |
| 42 | Stripe checkout / customer portal / webhooks | 10/12 | **MISSING** | No Stripe anywhere. The page says so: *"No real payment processor is wired up yet."* Clicking Switch to Premium returns *"Premium isn't available yet - payments aren't set up. Nothing has been charged or changed."* - disclosed, not silent. |
| 43 | `getUserPlan()` gating used consistently | 10/12 | **OK** | Eight call sites (layout, ticker, research, assistant, chat thread, methodology card, billing ×2); depth gating visible in the UI as "1 OF 3 SHOWN · Premium shows all 3 analogs". |
| 44 | Billing UI in Settings | 10/12 | **OK** | Settings → Billing shows plan, monthly AI usage (0/5) and a link through to the billing page. |
| 45 | Graceful downgrade on failure/expiry | 10/12 | **UNCLEAR** | `setTier` deliberately keeps *downgrade* available even with billing disabled, and there is no processor to fail. Cannot be exercised until a processor exists. |
| 46 | Persistent streamed chat | 11/AI | **PARTIAL (env-limited)** | Composer, thread list and quick prompts render. Sending returns 500 from `/api/chat` because the model is unreachable here; the UI degrades honestly - "NOT DELIVERED · The assistant could not complete that request. Nothing was saved" - and no half-written row is stored. Streaming/persistence were verified in the 2026-08-21 pass. |
| 47 | Daily briefing generation | 11/AI | **OK** | Clicked Generate: briefing built from stored analyses + calendar, written to `daily_briefings`, rendered as a card with the disclosure. No LLM needed - it templates validated records by design. |
| 48 | Probability engine producing stored analyses | 4/AI | **OK (display) / env-limited (generation)** | Stored analyses render at ticker, sector and market scope with probability range, confidence, sample size and reasoning. Generation needs the model. |
| 49 | Methodology transparency component | 6/AI | **OK** | Same card everywhere: sources with outlet and age, historical analogs with match scores, plain-language reasoning. No bare score is reachable. |
| 50 | Scope guard | 4/AI | **OK (by prior test suite)** | Not re-run here - it is a generation-time gate and the model is unreachable. `npm run test:scope-guard` is the adversarial suite that covers it. Worth noting: two of the three quick-prompt chips under the composer ("How is my portfolio doing today?", "Am I too concentrated in semis?") are personal-position questions the guard must refuse - the product suggests prompts it is designed to reject. |
| 51 | Tiered messaging (Free cap / Premium unlimited) | 12/AI | **OK** | Free tier shows "0 of 5 used" and gates analog depth while keeping the same confidence and caveats. Premium view unverified - the upgrade is intentionally disabled. |
| 52 | Research page: scope selector, portfolio relevance, library, quota | AI | **OK** | All four present: scope input, "Relevant to your portfolio", "Library · 3" with All/Tickers/Sectors/Market-wide and Newest/Confidence sort, and "This month 0 of 5 used". |
| 53 | Inline chat-triggered generation | AI | **PARTIAL (env-limited)** | Wired in `/api/chat`: `findMissingAnalysisScope()` → `runAnalysisGeneration()` - the same function the Research button calls, running before the chat turn, so quota, scope guard and storage are one code path. Cannot be executed without the model. |
| 54 | Compact grouped nav; no Settings in nav; no status dot | rev | **OK** | Five groups; Settings only in the avatar menu; no stray dot. (The header pill now reads "Auto-refresh · 30s"/"Market closed" and reflects a real timer.) |
| 55 | Type-ahead ticker search in Add Holding | rev | **OK** | Typing GDX in the modal ingests and offers it; free text cannot be submitted. |
| 56 | Icon edit/delete on portfolio rows | rev | **OK** | Pencil and trash icon buttons on every row, delete in the brand negative red `rgb(217,108,108)`, both `aria-label`led. |
| 57 | **404 pages on Markets and News** | rev | **PARTIAL** | A styled not-found component exists at `src/app/(app)/not-found.tsx`, but there is **no root `not-found.tsx`**, so `/markets/nonexistent` and `/news/anything` render Next's raw unstyled "404 · This page could not be found." The styled page is now reachable only via `/assistant/<bad-id>/settings`. Its copy is also stale - it says Cairn "tracks a defined set of symbols", which on-demand ingestion made untrue. |
| 58 | "Add Holding" on ticker detail | rev | **OK** | Present on every asset type, pre-filled with that ticker. |
| 59 | Watchlist button relocation + full-page "+ New Watchlist" | rev | **OK** | Add box sits below the list; /watchlists/new is a full page with name, description, default sort and sparkline toggle, plus a live preview. |
| 60 | **Global header search functional** | rev | **PARTIAL** | Works at ≥1080px (ingests unknown symbols, routes to the ticker page). **Below 1080px it does not**: at 420/760px the only visible search is a bare `<input placeholder="Search">` wired to nothing - typing produces no results and no navigation - and between 900 and 1080px there is no search box at all. Separately, it routes to `/ticker/[symbol]` rather than the "combined ticker/news/AI page" the revision asked for; that page does carry chart + news + analysis, so this may be a wording question. |
| 61 | Dashboard per-section summary modules | rev | **OK** | Portfolio, Markets, Watchlist, News and AI Assistant cards all render live figures matching their full pages. |
| 62 | **Dashboard customization persists** | rev | **PARTIAL** | Hiding a module works in the UI and stages the right payload (four hidden `layout` inputs). **Save layout writes nothing** - `user_settings.dashboard_layout` unchanged, no message, module returns on reload. Server log: `updateDashboardLayout(null, {})`. Same root cause as row 3. |

---

## Cross-cutting findings

### Orphaned code

- **`src/lib/news-data/provider.ts`** - a complete GNews fetch client, exported
  and never imported anywhere. Its own header admits it is "not wired into a
  cron/edge function yet". News ingestion actually happens through the RSS
  adapters in the Edge Function. Either wire it in as the multi-source news
  provider the spec asks for, or delete it - leaving it invites someone to
  assume news has an API-backed source it does not have.
- **`src/app/(app)/not-found.tsx`** - not orphaned in the strict sense, but
  nearly: after the ticker page moved to its own unavailable state, the only
  route that can still reach it is the chat-session settings page. The URLs
  users actually mistype get Next's default 404 instead (row 57).

### Duplicate / divergent implementations

- **Two search inputs in one header.** `GlobalSearch` (functional, ≥1080px) and
  a bare `<input placeholder="Search">` in `top-nav.tsx` (<900px, no handler,
  no state, no action). The mobile one is the only search a phone user sees.
  Consolidate onto `GlobalSearch` at every width.
- **Three sparkline implementations.** `Sparkline` (`components/sparkline.tsx`),
  `trendPoints()` (`markets/ticker-list.tsx`) and `sparklinePoints()`
  (`dashboard/dashboard-home.tsx`) each re-derive the same polyline maths with
  different viewBoxes. All three currently produce correct output - verified
  point-for-point against the DB in the chart pass - so this is duplication to
  consolidate, not a defect to fix.

### One shared root cause worth fixing first

Rows 3 and 62 are the same bug. Both forms are `useActionState` forms present in
the **initial server render**, and both post React's progressive-enhancement
fields (`$ACTION_REF_1`, `$ACTION_1:0`, `$ACTION_1:1`, `$ACTION_KEY`) alongside
their real fields. In both cases the server action is invoked with an **empty
FormData** and silently no-ops. The Add Holding form - same `useActionState`
pattern, but rendered only after a client interaction - posts `_1_symbol=…`
without those fields and works. That is the distinguishing factor to start
from.

Both failures are silent: neither form surfaces the outcome, so a user changes a
setting, clicks Save, sees nothing, and finds it reverted on the next load.

---

## Grouped by effort

Effort is about the fix, not the severity. A silent settings save is a core
Phase 1 feature failing, however small the patch turns out to be.

**Quick fixes (hours)**

1. Root `src/app/not-found.tsx` so mistyped URLs get the styled 404 (row 57),
   and refresh its now-stale copy about tracking "a defined set of symbols".
2. Render `GlobalSearch` at every breakpoint and delete the inert mobile input
   (row 60).
3. Add CSV alongside the existing JSON export (row 6).
4. Delete or wire `lib/news-data/provider.ts` (orphan).
5. Escape should close the Edit Asset modal (row 9).
6. Reconsider the two personal-position quick-prompt chips under the chat
   composer (row 50).

**Real feature work (days+)**

7. **The empty-FormData server-action bug** - settings and dashboard
   customization both silently fail (rows 3, 62). Highest priority: it makes a
   shipped Phase 1 feature non-functional.
8. Stripe checkout, customer portal and webhook sync (row 42).
9. `/api/v1/...` routes with documentation (row 39).
10. Admin/dev utilities route, role-gated, including Phase 4 engine health
    (row 40).
11. Forex/index layouts on the ticker page instead of the equity fallback
    (row 30).
12. Manual moderation controls on discussions (row 36).
13. Push/email alert delivery providers (row 25).
14. Reconcile the sector vocabularies behind news relevance (row 29).

**Needs a decision before any estimate (chief-of-staff)**

15. Trending carousel, company-profile tab, financial statements, technical
    overlays, options chain, pre-built screens, 2FA placeholder - none appear in
    any spec document in this repo (rows 13-17, 22, 5).
16. Whether the shipped calculators satisfy "retirement/growth" (row 38).
17. Whether the header search routing to the ticker page satisfies the
    "combined ticker/news/AI page" wording (row 60).
