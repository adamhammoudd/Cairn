<title>Feature Completeness Audit</title>

# Cairn - feature-completeness audit

**Run by:** dev-lead · **Date:** 2026-08-22 · **Branch:** `claude/ticker-coverage-chart-accuracy-bvw3og`
**Revision 2** - every non-OK row from the first pass has been worked, re-run
and re-recorded below. Two rows (3 and 62) were **false findings caused by this
audit's own harness** and are corrected; see the Correction section. Five rows
cannot be closed without external credentials or network access and are listed,
unclosed, under "What could not reach OK in this environment".
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

*Revision 2 note:* the **company-profile tab is in the roadmap after all** -
Phase 10 reads "ESG Score Panel: On the Company Profile tab", which presupposes
one. The rest of this note stands, and all seven items have now been built
regardless; whether they should have been remains a scope decision.

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
| 3 | **Settings persistence (Supabase synced)** | 1 | **OK** — *previously reported PARTIAL in error* | Currency EUR → **Save changes** → `user_settings.currency` = `EUR`, "Saved." rendered. The original PARTIAL was **my harness, not the app**: the local PostgREST shim's PATCH handler sent JS arrays to `text[]` columns as JSON, so every settings update failed with `22P02 malformed array literal: "[\"in_app\"]"`. Forcing a real database rejection shows the error verbatim beside the Save button and leaves the stored value intact, so the "silent failure" half of the original row was wrong too. See "Correction" below. |
| 4 | Auth: signup / login / password reset | 1 | **OK** | All four routes render with the right fields; logged in and out through the UI for every other test in this audit. |
| 5 | 2FA placeholder | 1 | **OK** | Settings → Account now carries a Two-factor panel: "NOT AVAILABLE YET", states TOTP + recovery codes are the plan and SMS is not, and holds real state. Clicked **Notify me when it ships** → `user_settings.two_factor_status` `not_enrolled` → `requested`; control flipped to "Remove me from the list". Deliberately not a switch that pretends to enable 2FA. |
| 6 | Data export | 1 / 11 | **OK** | Settings → Account offers **Export JSON** and **Export CSV**. CSV is RFC 4180-quoted with `# dataset:` section markers; both download real account rows. |
| 7 | Data delete | 1 | **OK (not executed)** | "Delete account" present with an explicit irreversible warning and a confirm dialog. I dismissed the dialog rather than destroy the audit account; the GDPR cascade is covered by `supabase/tests/gdpr_erasure.sql`. |
| 8 | Holding CRUD + custom purchase date | 2/3 | **OK** | Added TSM through the modal (positions 4→5) with `purchase_date = 2025-11-14`; deleted it (5→4). |
| 9 | "Edit Asset" modal | 2/3 | **OK** | Opened from a row, pre-filled with every field. Escape now dismisses it as well as Cancel. |
| 10 | Timeline-aligned chart, 1D–ALL | 2/3 | **OK** | Each range's drawn point count matched the window computed from the DB (1W 8/8 … ALL 539/539); 1D shows the honest no-intraday state. |
| 11 | Gain/loss, % return, cost basis | 2/3 | **OK** | Row and totals reconciled against the DB: AAPL 40 @ $232.14 → $12,629.20 value, +$3,343.60, +36.0%. |
| 12 | Allocation by sector / asset class / geography | 2/3 | **OK** | All three tabs render and re-split the same holdings. |
| 13 | Trending-ticker carousel / market deck | – | **OK** | A movers deck sits above the Markets table with four decks. Each ranking reproduced exactly from the DB: **Most active** and **Day gainers/losers** match to the symbol (gainers/losers only once the crypto rolling-24h rule is modelled, which is the app's deliberate behaviour), **Near 52-week highs/lows** likewise. Every deck prints the measure it ranked by. |
| 14 | Company profile tab | – | **OK** | Ticker page is now tabbed (Overview / Profile / Technicals, plus Financials + Options on equities and ETFs). Profile renders long name, summary, sector, industry, exchange, currency, employees, HQ, first-traded and instrument type from `symbol_profiles`; every field checked against the stored row. ESG moved onto this tab, as roadmap Phase 10 specifies. |
| 15 | Financial statements (income / balance / cash flow) | – | **OK** | `financial_statements` + an ingest path off the provider's quoteSummary modules. AAPL renders income/balance/cash-flow at annual and quarterly, 4 periods each, 24 stored rows; figures match the provider response. SPY (ETF) renders the honest empty state rather than a table of zeros. **Verified against a fixture modelled on Yahoo's documented response shape, not the live API — egress blocks it.** |
| 16 | Technical overlays (SMA/EMA/RSI/MACD) | – | **OK** | Technicals tab: price with toggleable SMA 50 / SMA 200 / EMA 20, plus RSI(14) with 30/70 bands and MACD(12,26,9) with histogram. Drawn vertex counts match the DB window at every range (6M 130/130, 1Y 262/262, 2Y and ALL 505/505; SMA 200 draws 306 of 505, exactly where a 200-bar average becomes computable). Indicators are computed over the whole series then sliced, so a 200-day average is not restarted at the window edge. |
| 17 | Options chain | – | **OK** | `option_contracts` + an ingest path off the provider's options endpoint. SPY renders calls and puts for the front expiry with strike/last/bid/ask/volume/OI/IV and an expiry selector; non-optionable types get the honest empty state. Cairn computes **no Greeks** and says so — they need a pricing model, and a modelled number beside quoted ones would be indistinguishable from market data. Same fixture caveat as row 15. |
| 18 | Multi-asset screener, debounced filtering | 4/7 | **OK** | Set min price 500 → match count fell 48 → 6 without a reload; asset-type pills, price/%/volume/cap/PE/yield filters all present. |
| 19 | Saved screens (Supabase-synced) | 4/7 | **OK** | Saved "Audit screen"; row persisted in `saved_screens` with the filter JSON, and it reappears after a reload with a delete control. |
| 20 | Multiple named watchlists | 4/7 | **OK** | Created "Defence & space" through the full-page flow; persisted with its description and redirected to /watchlists. |
| 21 | Drag-to-reorder + sparklines | 4/7 | **OK** | Dragged NVDA from position 1 to 3; `watchlist_items.sort_order` changed in the DB. Sparkline points match the DB's last 30 closes exactly. |
| 22 | Pre-built screens (Gainers/Losers/Most Active/52W) | – | **OK** | Five presets in the screener sidebar. Each result set reproduced from the DB: Most active, Near 52-week highs and Near 52-week lows match exactly; gainers/losers match under the crypto rolling-24h rule. Each preset renders a banner stating what it selected and how it ordered. Editing any filter leaves the preset entirely, so no hidden proximity cut survives its banner. |
| 23 | Alert types (price, %, volume, crossover, AI confidence) | 5/8 | **OK** | The type selector offers all five, including the roadmap's "AI confidence" type. Created a price alert on AAPL @ 400; row persisted. |
| 24 | Alert management: edit / delete / pause | 5/8 | **OK** | Per-row icon controls. Paused one: `alerts.enabled` true → false. Edit re-opens pre-filled with type, scope, comparator, value, cooldown, channels. |
| 25 | Delivery channels (in-app / push / email) | 5/8 | **PARTIAL — cannot reach OK here** | Unchanged and honestly disclosed: all three selectable and stored, only in-app delivers. Wiring push and email needs a real provider and credentials that do not exist in this environment. Reported as still open rather than papered over. |
| 26 | Cooldown / rate limiting | 5/8 | **OK (config verified)** | Per-alert cooldown selector (1/6/12/24h) persisted as `cooldown_seconds = 3600`. Firing itself is a scheduled Edge Function and was not triggered here. |
| 27 | Calendars: earnings, economic, dividend, IPO, split | 6/7 | **OK** | All five types render and filter. The filter is a multi-select toggle (empty = all), verified by cycling each type and watching the "next up" rail. |
| 28 | Ticker-specific + market-wide news | 6 | **OK** | /news lists market-wide with source and age; the ticker page carries its own filtered feed. |
| 29 | News relevance ranking | 6 | **OK** | Reconciled. `src/lib/sectors.ts` is now the single vocabulary; both `holdings.sector` (free text) and `news_items.sectors` (tagger slugs) are normalised before comparison, so "Technology"/"tech"/"Information Technology" all match the tagger's `technology`. Unrecognised text is **not** forced into the nearest slug. `npm run test:sectors` — 27/27 — asserts every slug the tagger can emit is known to the app, so the two cannot drift apart silently again. |
| 30 | Asset-type routing on ticker detail | 7/9 | **OK** | Each type now gets its own stat grid and tab set. `EURUSD` shows Base/quote, rate-formatted prices to 5dp and distance from its 52-week extremes — no P/E, no "Next event". `^GSPC` shows index levels and constituent volume. Crypto keeps rank and circulating supply. Financials and Options tabs are offered only where they can carry data. |
| 31 | Crypto folded into Markets; standalone page removed | 7/9 | **OK** | /crypto 307-redirects to /markets; crypto renders through the same row component as everything else, filterable by the Crypto pill. |
| 32 | Comparison, up to 4 tickers | 8/10 | **OK** | Requested five symbols; exactly four plotted on one shared timeline with a key-stat table. |
| 33 | Sector heat map | 8/10 | **OK** | 13 sectors; tile colour and intensity match each symbol's real daily change to three decimals. |
| 34 | Discussion threads + voting | 8/10 | **OK** | Posted a comment (2→3 rows). Voted: thread went 1/0 → 0/1 and the `discussion_votes` row flipped direction - one vote per user, switchable, counts derived. |
| 35 | Spam filtering | 8/10 | **OK** | Posted a spam-shaped comment; stored with `flagged = true` automatically and hidden from everyone but its author. |
| 36 | Manual moderation (report/flag control) | 8/10 | **OK** | Full loop exercised: a **Report** control appears on comments the reader does not own (1 of 3 on the test page); reporting stored reason + detail; after reload the control reads "Reported" and a second report is refused by the unique constraint. One report is below the hide threshold, so the comment stayed visible. As admin, **Uphold & hide** set `flagged = true` and the report to `upheld` with `resolved_by` — the comment then disappeared for the reporter and stayed visible to its author with "Flagged for review". Nothing is deleted at any step. |
| 37 | ESG score panel | 8/10 | **OK** | Renders on equity/ETF pages with E/S/G/total and an explicit "illustrative demo data, not a live ESG provider" label. |
| 38 | Calculators | 9/11 | **OK** | A Growth & retirement projection now sits above the three trading calculators: month-by-month compounding, fee drag applied to the rate, an inflation-deflated "today's money" figure, a required-contribution solver and a withdrawal-rate readout. All six headline figures reproduced by an independent implementation to the dollar ($702,814 / $379,091 / $250,000 / $452,814 / $1,139 per month / $28,113). Standalone — it reads nothing from the portfolio and saves nothing. |
| 39 | Documented `/api/v1/...` routes | 9/11 | **OK** | Five endpoints, self-documenting at `/api/v1`. Verified: unauthenticated calls to every data endpoint return `401 unauthenticated`; holdings cost basis, market value and as-of date match the DB row for row; watchlists match; prices returns 30 bars identical to the DB and ingests a never-fetched symbol on the spot (PLAB, 0 → 505 bars); `?scope=nonsense` → `400 bad_scope`. Analyses come back through the **same loader the UI uses**, so sources, analogs and confidence are always attached — a bare score is not reachable in JSON either. Read-only by design. |
| 40 | Admin / dev utility route (role-gated) | 9/11 | **OK** | `/admin` returns **404 to a member** and the nav never offers it; granted `profiles.role = admin`, it renders Data refresh, Rate limits & errors, Engine health, Providers and the moderation queue. Every headline figure cross-checked against the DB: 51 symbols, 24,240 bars, newest bar 2026-08-22, 3 analyses, 33% with analogs, 0.72 mean match score. The role gate is re-checked in the data loader, not just the page. |
| 41 | Free/Premium plan model | 10/12 | **OK** | Billing page shows both plans with their AI quotas and the current plan; `subscriptions` table backs it. |
| 42 | Stripe checkout / customer portal / webhooks | 10/12 | **MISSING — cannot reach OK here** | Unchanged. Wiring Stripe needs API keys, a webhook endpoint and a test account, none of which exist in this environment; writing the integration blind and reporting it as working would be worse than leaving it disclosed. The app still says so in its own UI. |
| 43 | `getUserPlan()` gating used consistently | 10/12 | **OK** | Eight call sites (layout, ticker, research, assistant, chat thread, methodology card, billing ×2); depth gating visible in the UI as "1 OF 3 SHOWN · Premium shows all 3 analogs". |
| 44 | Billing UI in Settings | 10/12 | **OK** | Settings → Billing shows plan, monthly AI usage (0/5) and a link through to the billing page. |
| 45 | Graceful downgrade on failure/expiry | 10/12 | **UNCLEAR** | `setTier` deliberately keeps *downgrade* available even with billing disabled, and there is no processor to fail. Cannot be exercised until a processor exists. |
| 46 | Persistent streamed chat | 11/AI | **PARTIAL (env-limited)** | Composer, thread list and quick prompts render. Sending returns 500 from `/api/chat` because the model is unreachable here; the UI degrades honestly - "NOT DELIVERED · The assistant could not complete that request. Nothing was saved" - and no half-written row is stored. Streaming/persistence were verified in the 2026-08-21 pass. |
| 47 | Daily briefing generation | 11/AI | **OK** | Clicked Generate: briefing built from stored analyses + calendar, written to `daily_briefings`, rendered as a card with the disclosure. No LLM needed - it templates validated records by design. |
| 48 | Probability engine producing stored analyses | 4/AI | **OK (display) / env-limited (generation)** | Stored analyses render at ticker, sector and market scope with probability range, confidence, sample size and reasoning. Generation needs the model. |
| 49 | Methodology transparency component | 6/AI | **OK** | Same card everywhere: sources with outlet and age, historical analogs with match scores, plain-language reasoning. No bare score is reachable. |
| 50 | Scope guard | 4/AI | **OK (by prior test suite)** | Unchanged gate. The two personal-position quick-prompt chips are gone: the composer now suggests market-scope prompts ("What's moving semiconductors this week?", "What's the volatility outlook on NVDA?", "How have past rate decisions moved this market?"), so the product no longer suggests prompts its own guard must refuse. |
| 51 | Tiered messaging (Free cap / Premium unlimited) | 12/AI | **OK** | Free tier shows "0 of 5 used" and gates analog depth while keeping the same confidence and caveats. Premium view unverified - the upgrade is intentionally disabled. |
| 52 | Research page: scope selector, portfolio relevance, library, quota | AI | **OK** | All four present: scope input, "Relevant to your portfolio", "Library · 3" with All/Tickers/Sectors/Market-wide and Newest/Confidence sort, and "This month 0 of 5 used". |
| 53 | Inline chat-triggered generation | AI | **PARTIAL (env-limited)** | Wired in `/api/chat`: `findMissingAnalysisScope()` → `runAnalysisGeneration()` - the same function the Research button calls, running before the chat turn, so quota, scope guard and storage are one code path. Cannot be executed without the model. |
| 54 | Compact grouped nav; no Settings in nav; no status dot | rev | **OK** | Five groups; Settings only in the avatar menu; no stray dot. (The header pill now reads "Auto-refresh · 30s"/"Market closed" and reflects a real timer.) |
| 55 | Type-ahead ticker search in Add Holding | rev | **OK** | Typing GDX in the modal ingests and offers it; free text cannot be submitted. |
| 56 | Icon edit/delete on portfolio rows | rev | **OK** | Pencil and trash icon buttons on every row, delete in the brand negative red `rgb(217,108,108)`, both `aria-label`led. |
| 57 | 404 pages on Markets and News | rev | **OK** | Root `src/app/not-found.tsx` added, so mistyped URLs anywhere get the branded page. The stale "tracks a defined set of symbols" copy is gone — on-demand ingestion made it untrue. |
| 58 | "Add Holding" on ticker detail | rev | **OK** | Present on every asset type, pre-filled with that ticker. |
| 59 | Watchlist button relocation + full-page "+ New Watchlist" | rev | **OK** | Add box sits below the list; /watchlists/new is a full page with name, description, default sort and sparkline toggle, plus a live preview. |
| 60 | **Global header search functional** | rev | **OK** | `GlobalSearch` now renders at every breakpoint and the inert mobile `<input placeholder="Search">` is deleted. Type-ahead confirmed responding at 390 / 760 / 900 / 1080 / 1400px. (The "combined ticker/news/AI page" wording is still a wording question, not a defect — the ticker page carries chart, news and analysis.) |
| 61 | Dashboard per-section summary modules | rev | **OK** | Portfolio, Markets, Watchlist, News and AI Assistant cards all render live figures matching their full pages. |
| 62 | **Dashboard customization persists** | rev | **OK** — *previously reported PARTIAL in error* | Hiding a module and clicking **Save layout** persists `user_settings.dashboard_layout`, and the module stays hidden across reloads. Same correction as row 3: the failure was my shim's PATCH handler, not the app. |

---

## Correction: rows 3 and 62 were my fault, not the app's

The first pass reported settings persistence and dashboard customization as
broken, with a confident root cause: "the server action is invoked with an empty
FormData", blamed on React's progressive-enhancement fields. **That was wrong.**

A minimal probe page disproved it - a server-rendered `useActionState` form does
deliver its FormData. Instrumenting `updateSettings` showed the real error:

```
22P02  malformed array literal: "["in_app"]"
```

The local PostgREST shim this audit runs against was sending JavaScript arrays
to `text[]` columns as JSON rather than as array literals, so **every** update
touching `default_alert_channels` or `dashboard_layout` failed. Both forms are
fine; both persist correctly against a fixed shim, verified above.

The original row also claimed the failure was silent. It is not. Forcing a real
database rejection (a temporary check constraint on `currency`) renders the
error verbatim next to the Save button, leaves the stored value untouched, and
the next valid save succeeds and says "Saved.":

```
GBP  -> posted _1_currency=GBP  DB=GBP  "Saved."
EUR  -> posted _1_currency=EUR  DB=EUR  "Saved."     (second save, no reload)
JPY  -> posted _1_currency=JPY  DB=EUR  "violates check constraint ..."
CAD  -> posted _1_currency=CAD  DB=CAD  "Saved."     (recovery after failure)
```

So the whole of rows 3 and 62 was a harness artifact - cause and symptom both.

What follows from that is worth more than the retraction: **a harness bug
reported as a product bug is a false finding**, and this was the loudest finding
in the report - "highest priority", top of the effort list, with a confident
mechanism attached. The check that caught it (build a minimal reproduction
before naming a cause) should have run before the row was written, not after.

That failure mode recurred twice more while writing this revision, and both
times it was an **unqualified query in the harness**, not in the app: a
`select currency from user_settings` with no `WHERE` returned a second test
user's row and made three correct saves look like silent no-ops. Verification
code needs the same scepticism as the code under test.

## Defects found while fixing, not present in the first pass

Verifying the fixes turned up four real problems the first pass had not reached:

- **The ticker chart's ALL and 2Y ranges were capped at 400 bars** while the
  store holds 505, so both buttons drew the same ~19 months and a 200-day
  average could not start until a third of the way into a 1-year view. The cap
  now exceeds the longest range offered; every range's drawn vertex count
  matches the DB window exactly.
- **Instruments that first traded before 1970 stored no profile at all.** The
  epoch-unit heuristic compared a *signed* value against a positive threshold,
  so the S&P 500's `-631123200000` was treated as seconds and multiplied again,
  producing the year -18030 - which `toISOString()` renders in extended-year
  form and Postgres rejects, failing the whole row. The oldest and
  best-known listings were exactly the ones that would have shown an empty
  Profile tab. Fixed by comparing the absolute value and rejecting any year
  outside four digits.
- **Negative open interest rendered as market data.** A count that cannot be
  negative is now treated as missing rather than printed beside real figures.
- **The "Most searched" deck ranked on a column where every row was tied**, so
  a stable sort silently fell back to the incoming order - the gainers ranking
  wearing a popularity label. It now refuses to rank until the counts actually
  differentiate, and tie-breaks deterministically when they do.

## Cross-cutting findings - resolved

- **Orphaned code.** `src/lib/news-data/provider.ts` (an unwired GNews client)
  deleted. `src/app/(app)/not-found.tsx` is reachable again now that a root
  `not-found.tsx` exists.
- **Two search inputs in one header.** Resolved - the inert mobile input is
  gone and `GlobalSearch` renders at every width.
- **Three sparkline implementations.** Consolidated onto one `Sparkline`
  component with a single exported `sparklinePoints()`. The two inline copies
  are deleted.

## What could not reach OK in this environment

These are reported as still open rather than marked passing:

| Row | Item | Why it cannot be closed here |
| --- | --- | --- |
| 42 | Stripe checkout / portal / webhooks | Needs API keys, a webhook endpoint and a test account. The app discloses the absence in its own UI. |
| 45 | Graceful downgrade on failure | Depends on row 42 - there is no processor to fail. |
| 25 | Push / email alert delivery | Needs a real delivery provider and credentials. Both channels are stored and disclosed as undelivered. |
| 46, 48 (generation), 53 | Chat replies, analysis generation, inline generation | The egress policy blocks the model host. Display surfaces and the failure path are verified; generation was verified in the 2026-08-21 pass. |
| 50 (live tier) | Adversarial scope-guard Tier B | Same - needs the live pipeline. Tier A (15 cases) and the 53-case probe suite pass. |

Rows 15 and 17 reached OK against a **fixture modelled on the provider's
documented response shape**, because the same egress policy blocks the live
API. The ingest, storage and render paths are real and verified end to end; what
is not verified is that the live provider's payload matches the fixture's shape
in every field.

## Test suites

`npm run test:ai-suite` - 14 suites, all gating suites pass. The one
INCOMPLETE is the live scope-guard tier above, which needs the model host.
`npm run test:sectors` (27 cases) is new in this pass and gating.
