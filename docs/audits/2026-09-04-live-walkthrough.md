# Cairn — Live Walkthrough Findings (2026-09-04)

**Method:** Logged into Adam's real Cairn account at `localhost:3000` (dev build) through Chrome,
using the actual browser rather than reading source. Every page in the nav was opened and used:
Base Camp, Markets, Portfolio, Watchlists, Comparison, Screener, Sector map, a Ticker page,
Assistant/Chat, Research, News, Calendar, Calculators, Alerts, Settings (all tabs), Billing, and
the internal Operations/admin page. No data was changed — one Edit-asset modal was opened to
inspect stored values and closed with Cancel, not Save.

This is a companion to the earlier full source review and the fix-sweep that followed it. It only
covers what actually shows up in live use, and it separates confirmed-working fixes from new
issues.

## 1. Portfolio Holdings shows a badly wrong price for BTC — and the root cause is visible on the admin page

The Portfolio → Holdings table's BTC row is far off from BTC's real price. Three independent
sources agree with each other and disagree with that one row:

- The BTC ticker page shows the correct live price.
- The Calculators / scenario-modeling widget, which pulls its own quote, shows the correct price
  and a Current Total that reconciles with the nav-bar portfolio total.
- Arithmetic backed out from the correctly-computed nav-bar total also matches those two.

Only the Holdings table row itself is wrong — this isn't a market-data-wide outage.

The internal Operations page (`/admin`, linked from the account menu as "Operations (internal)")
explains why: under **Data refresh**, 64 of 75 tracked symbols are flagged stale (>24h since last
successful check), and BTC is one of them — its stored bars were **last checked 12 days ago**. The
Holdings table is reading a stale cached row from the trend store instead of a live quote, while
the Ticker page and Calculators widget fetch live. This is a strong, first-party diagnosis: the
refresh job that's supposed to revisit these 75 symbols isn't running (or isn't completing) for at
least 64 of them, BTC included.

**Suggested fix direction:** either get the stale-data refresh job actually running against all 75
symbols again, or — as a stopgap — have the Holdings table fall back to a live quote (the same call
Ticker/Calculators already make) instead of the stored trend-store row when that row is older than
some threshold.

## 2. Portfolio asset-class breakdown mislabels BTC as "Unclassified"

The Edit-asset modal for the BTC holding correctly stores `asset_type: Crypto`. But the Portfolio
page's asset-class allocation widget buckets that same holding under "Unclassified" rather than
"Crypto." The classification exists in the data; the allocation widget just isn't reading it (or is
keying off a different/renamed field).

## 3. AI chat answers sometimes leak raw citation tokens as visible text

Asked the Assistant "What's driving semiconductor sector momentum this week?" The free-text portion
of the answer rendered literal, unformatted citation markers inline in the prose, e.g.:

> "...as big-tech stocks near record highs 【0568bbc0-05bf-4862-a426-166a8350c6c3】. The broader
> rally is reinforced... 【37577c02-70ce-4897-b9cd-edf72c7025d0】."

These are clearly meant to become footnote/source links, not literal text. Notably, the separate
"Elevated Move Likelihood" probability card in the *same* response rendered its own sources
correctly (a proper "Sources · 25" list with clickable titles) — so the correct rendering path
exists elsewhere in the app, it's just not being used for the free-text chat answer. Likely a
formatting gap in whatever turns the model's citation markers into links for the chat reply
specifically (as opposed to the probability-card component).

## 4. Markets page: clicking a ranking tab updates the stat cards but not the table

On `/markets`, switching between "Day gainers / Day losers / Most active / Most searched" updates
the top stat-card row, but the main ranked table underneath stays frozen on the initial "Day
gainers" list regardless of which tab is selected. Reproduced twice, including after waiting out a
Turbopack recompile, so it isn't a compile-timing artifact — the tab selection state isn't being
wired to the table's data source.

## 5. Sector map: multiple tickers collide into one truncated label

In small tiles (seen in the "Digital assets" sector), several distinct ticker symbols all render as
the same truncated "U." label, with no hover tooltip to disambiguate which symbol a given tile
actually represents. Cosmetic but genuinely confusing — you can't tell what you're looking at
without leaving the page.

## Confirmed working (fixes from the earlier sweep hold up live)

- **Screener** (PR #69 claim): preset clicks now instantly filter both the input controls and the
  table in sync, no DB round-trip lag. Verified.
- **Chat composer button** (PR #77 claim): shows "Skip" during generation, not "Stop." Verified.
- **Calendar month navigation**: the `‹ ›` arrows correctly advance/rewind the month grid (Sept →
  Oct 2026 tested) and "Today" highlighting is correct.
- **News page** ranking/filtering ("Everything / Your holdings / Your sectors / Macro") correctly
  scopes to portfolio-matched items.
- Settings, Billing, and the internal Operations page are all functional, and Operations in
  particular is genuinely useful — it's what surfaced the root cause of finding #1 above.

## Minor / not worth a ticket on its own

- The "Planning" nav dropdown didn't reliably close on Escape or on scrolling the page — had to
  click away to dismiss it. Small annoyance, not a data or correctness issue.

## Not investigated this pass

Mobile/responsive rendering wasn't checked in this walkthrough — worth a separate pass if that
matters for how Adam or early users will actually use the app.
