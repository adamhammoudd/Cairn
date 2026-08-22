<title>Coverage and Chart Accuracy Pass</title>

# Cairn - ticker coverage + chart accuracy pass

**Run by:** dev-lead · **Date:** 2026-08-22 · **Branch:** `claude/ticker-coverage-chart-accuracy-bvw3og`
**Follows:** `docs/audits/2026-08-20-verification-pass.md` and
`docs/decisions/2026-08-20-universe-size.md`

Every claim below is tagged with how it was verified. Nothing is marked PASS on
the basis of code reading alone.

---

## How this was verified, and the one thing that could not be

This session's egress policy blocks every market-data host. Confirmed, not
assumed - `curl` through the session proxy:

```
query1.finance.yahoo.com  -> 403 at the gateway (policy denial)
api.coingecko.com         -> 403
api.twelvedata.com        -> 403
*.supabase.co             -> 403
```

So the verification stack is local and complete except for the provider itself:

| Layer | What ran | Real? |
|---|---|---|
| Database | Postgres 16, built from `supabase/schema.sql` + every migration + the `supabase/tests/harness` shims | **yes** - the committed schema, RLS policies and functions |
| API | a PostgREST + GoTrue-compatible shim over that database (`set local role` + `request.jwt.claims` per request, response bodies built with `json_agg` in Postgres so types serialise identically) | **yes, over HTTP** - the app is unmodified |
| App | `next dev`, driven in Chromium via Playwright, logged in as a real user | **yes** |
| Market data | a local server answering the Yahoo chart and CoinGecko shapes | **no - fixture** |

**What that means for these results.** Everything about *shape, ordering,
windowing, typing, colour, consistency and freshness* is verified against a
real database through the real UI. What is **not** verified is that Yahoo
itself still returns data for a given ticker today - that was established by
the 2026-08-20 pass, which pulled all 35 of these symbols live. The fixture's
last-bar prices are the exact values that pass recorded (RKLB 76.34, IWM
301.85, UNI 3.51, …) so the numbers below line up with it; the history behind
each is a seeded deterministic walk, which is what makes every expected value
computable rather than merely observed.

Verification scripts used: a page sweep, a search-UI driver, a cross-page
consistency differ, a timeframe-window differ and a sparkline point-for-point
differ. They are session scratch, not committed; the durable regressions live
in `supabase/tests/` and run under `npm run test:db`.

---

# Part 1 - Ticker universe

## What shipped

On-demand ingestion, option (b) from the universe-size decision. A symbol is
fetched the first time anyone searches for it or opens it, typed from the
provider's own `instrumentType`, stored, and refreshed by the daily job from
then on. `src/lib/market-data/ingest.ts` + migration
`0027_on_demand_ingestion.sql`.

- **Caching.** `symbol_directory` is a per-outcome TTL cache: a hit is not
  re-fetched for 15 minutes, a miss is remembered for 24 hours, a provider
  refusal backs off 5 minutes. Concurrent callers for one symbol share a single
  in-flight promise.
- **Rate limiting.** A process-wide token bucket (60/minute by default) caps
  outbound calls and returns `rate_limited` rather than queueing. A refusal by
  *our own* bucket is deliberately never written to the directory, because that
  budget refills in under a minute and a 5-minute cooldown would lock a symbol
  out for longer than the thing that blocked it.
- **Loading state.** The type-ahead shows `Checking for data on <SYMBOL>…`
  while a probe is in flight, then either the result tagged **JUST ADDED** or a
  plain statement that no data is available.
- **Crypto.** `TOP_N = 25` is gone: `ingest-crypto` paginates to
  `config.top_n` (default 250) and additionally refreshes coins ingested on
  demand however they rank. Any coin is fetchable on demand through the same
  path as an equity.

## The long-tail test, re-run through the search UI

The database was first reset to the exact universe the 2026-08-20 audit found -
7 equities, SPY, and the top coins (11 symbols) - so every one of these started
as a genuine miss. Each symbol was then **typed into the header search box in a
real browser**, the type-ahead result clicked, and the resulting ticker page
read.

**35 of 35 resolved.** Asset type is the provider's, not a default:

| Ticker | Type shown | Price shown | Day range contains price | 52w range contains price |
|---|---|---|---|---|
| AXON | equity | $635.27 | ✓ 628.87–637.80 | ✓ 568.88–650.95 |
| CROX | equity | $125.09 | ✓ | ✓ |
| CELH | equity | $31.80 | ✓ | ✓ |
| SMCI | equity | $37.28 | ✓ | ✓ |
| PLAB | equity | $30.99 | ✓ | ✓ |
| KTOS | equity | $61.10 | ✓ | ✓ |
| IONQ | equity | $43.41 | ✓ | ✓ |
| BROS | equity | $50.15 | ✓ | ✓ |
| RKLB | equity | $76.34 | ✓ 74.81–77.21 | ✓ 71.11–79.49 |
| PENN | equity | $18.67 | ✓ | ✓ |
| ASML | equity | $1,756.35 | ✓ | ✓ |
| TSM | equity | $412.83 | ✓ | ✓ |
| BABA | equity | $128.59 | ✓ | ✓ |
| SAP | equity | $216.23 | ✓ | ✓ |
| SHOP | equity | $146.38 | ✓ | ✓ |
| IWM | **etf** | $301.85 | ✓ | ✓ |
| XLE | **etf** | $63.68 | ✓ | ✓ |
| VNQ | **etf** | $98.07 | ✓ | ✓ |
| ARKG | **etf** | $46.85 | ✓ | ✓ |
| SCHD | **etf** | $35.10 | ✓ | ✓ |
| EEM | **etf** | $66.02 | ✓ | ✓ |
| JEPI | **etf** | $58.03 | ✓ | ✓ |
| TLT | **etf** | $82.69 | ✓ | ✓ |
| GDX | **etf** | $95.73 | ✓ | ✓ |
| UNI | **crypto** | $3.51 | ✓ | ✓ |
| AAVE | **crypto** | $92.07 | ✓ | ✓ |
| RENDER | **crypto** | $1.32 | ✓ | ✓ |
| JUP | **crypto** | $0.18 | ✓ | ✓ |
| ARB | **crypto** | $0.08 | ✓ | ✓ |
| INJ | **crypto** | $4.39 | ✓ | ✓ |
| CRV | **crypto** | $0.25 | ✓ | ✓ |
| TIA | **crypto** | $0.31 | ✓ | ✓ |
| PENDLE | **crypto** | $1.35 | ✓ | ✓ |
| OP | **crypto** | $0.09 | ✓ | ✓ |
| GRT | **crypto** | $0.01 | ✓ | ✓ |

Plus two asset classes whose Markets tabs could not previously be populated at
all, because there was no way to store their type:

| `EURUSD` | **forex** | $1.09 | ingested by typing `EURUSD` |
| `^GSPC` | **index** | $7,042.18 | ingested by typing `^GSPC` |

`index` is a new stored `asset_type` (migration 0027). The Markets "Indices"
tab used to filter on `future`, so an index and a future were the same value
and the tab could only ever be as right as that guess.

### Rate limits and unavailable symbols

| Case | What the UI shows | Verified |
|---|---|---|
| Symbol the provider does not carry (`ZZZZFAKE`) | *"No market data available for ZZZZFAKE."* in the dropdown; the ticker page renders a named unavailable state, no placeholder price | live, in browser |
| Provider answers 429 | *"The market data provider is rate-limiting Cairn right now - try again shortly."* | live (fixture returns 429 for a reserved symbol) |
| Cairn's own budget spent | *"Too many symbol lookups right now - try again in a few seconds."* - and nothing is written to the directory, so the next attempt seconds later goes through | live: 35 symbols back-to-back exhausted the bucket mid-run; the three affected symbols resolved on retry |
| Repeat lookup inside the cache window | **0 outbound provider calls** for a hit, a miss and a rate-limited symbol on the second pass | counted at the provider |

### Search reaches beyond the local cache - PASS

One shared `SymbolTypeahead` backs Add Holding, Alerts, Compare, the header
search, the watchlist add box and the Research scope picker, so all six gained
this at once. Stage one queries the local directory on every keystroke; stage
two fires only for ticker-shaped input with no exact local hit, after a 350 ms
pause. Compare additionally gained a search box - it previously offered only a
fixed dropdown of the tracked universe, so an un-ingested symbol could not be
compared at all.

`addWatchlistItem` no longer refuses a symbol for being "not tracked yet"; it
ingests, and refuses only when the provider genuinely has nothing.

---

# Part 2 - Chart and graph accuracy

## 2.1 Root-cause bugs

**Three of the eight chart surfaces were returning HTTP 500 before this pass.**
Found by loading them, not by reading them:

| Surface | Error | Cause |
|---|---|---|
| `/` (Base Camp) | `MODULE_KEYS.includes is not a function` | the Server Component imported a plain array from a `"use client"` module; across the RSC boundary that is a client *reference*, not the array |
| `/comparison` | `s.toUpperCase is not a function` | `getTrackedSymbols()` mapped over `data_providers.config.symbols`, which migration 0020 had turned into a mix of strings and objects |
| `/sector-map` | same | same call |

Both are fixed and both pages now render (screenshots in the sweep below).

**The `.order("ts")` sweep.** Every call site was examined, not just the two the
audit named (which were already fixed):

| Site | Before | Verdict |
|---|---|---|
| `actions/ticker.ts` | `desc` + `limit(400)` | already correct |
| `actions/comparison.ts` | `desc` + per-symbol query | correct, now via `recent_prices()` |
| `app/(app)/page.tsx` | **`asc`, no limit** | **defect** - under PostgREST's row cap that is the OLDEST rows. Now `recent_prices()` |
| `app/(app)/portfolio/page.tsx` | **`asc`, no limit** | **defect**, same. Now `recent_prices()` |
| `actions/planning.ts` | **`asc`, no limit** | **defect** - the calculators valued the portfolio from the oldest closes. Now `recent_prices()` |
| `actions/screener.ts` (Markets + Screener) | `desc` + `limit(2000)` **shared across all symbols** | **defect class 2** (below) |
| `actions/watchlists.ts` | `desc` + `limit(symbols.length * 30)` **shared** | **defect class 2** |
| `actions/sector-map.ts` | `desc` + `limit(symbols.length * 6)` **shared** | **defect class 2** |
| `actions/crypto.ts` | `desc` + `limit(2000)` **shared** | **defect class 2** |
| `market-data/current-price.ts` | `desc`, no limit, all symbols | **defect class 2** |
| `functions/evaluate-alerts` | `desc` + `limit(symbols.length * 250)` **shared** | **defect class 2** - a starved symbol's alerts stop evaluating |
| `functions/ingest-historical-events` | **`asc`, no limit** | **defect** - regimes would be derived from the start of the series |
| `functions/ingest-crypto` | `desc`, no limit, all crypto rows | **defect class 2** |

**Defect class 2 - a LIMIT shared across symbols.** `symbols.length * 30`
reads as "30 each" and is not: rows interleave by date, so the depth each
symbol actually gets is the budget divided by the number of symbols, and a
symbol whose newest bar is older than its neighbours' (a coin over a weekend, a
symbol ingested on demand and not refreshed since) falls out of the window
entirely - no sparkline, null % change, no error anywhere. On-demand ingestion
makes the symbol count unbounded, so this had to be fixed before the universe
could grow. `recent_prices(symbols[], per_symbol)` and
`recent_prices_all(per_symbol, asset_types[])` apply the LIMIT inside a lateral
join, per symbol.

Covered by six new cases in `supabase/tests/price_ordering.sql`, including the
control that reproduces the defect (two symbols, 30 shared rows, the staler one
gets **zero**). Negative-controlled: reverting `recent_prices()` to the shared
shape makes the suite fail with `50 / 10` instead of `30 / 30`.

**52-week and day range.** The 52-week range now comes from its own
date-windowed query rather than being filtered out of the 400-bar chart slice
(400 trading days is more than a year *today*, which is a coincidence of the
current bar count, not a guarantee). Open and day range are taken from the same
source as the headline price, so a live quote can no longer sit beside a day
range drawn from a stored daily bar - the shape that produced
`price $315.73 / day range $249.52–$256.33`.

## 2.2 Surface by surface

Ground truth for each is the database, read directly with `psql`; the "shown"
column is scraped from the rendered page in Chromium.

### Ticker detail chart - **PASS**

`/ticker/AAPL`, all figures internally consistent and matching the store:

| Field | Shown | DB |
|---|---|---|
| Price | $315.73 | 315.73 (close of 2026-08-21) |
| Open | $318.31 | 318.306221 |
| Day range | $315.29 – $319.42 | 315.287466 / 319.421191 |
| 52w range | $286.92 – $341.47 | 286.923886 / 341.473286 |
| Freshness | DELAYED · CLOSE OF AUG 21, 2026 | latest bar 2026-08-21 |

Price sits inside the day range; the day range sits inside the 52-week range.
Same check passes on `/ticker/RKLB` (long-tail) and `/ticker/BTC` (crypto).

Timeframe windows, counted from the drawn SVG path and compared with the window
computed from the database:

| Range | AAPL drawn | expected | stroke | direction in DB |
|---|---|---|---|---|
| 1D | empty state | - | - | no intraday feed configured; the card says so |
| 1W | 6 | 6 | red | 316.07 → 315.73 (down) |
| 1M | 23 | 23 | red | 319.17 → 315.73 (down) |
| 3M | 65 | 65 | red | 322.33 → 315.73 (down) |
| 1Y | 262 | 262 | green | 288.13 → 315.73 (up) |
| ALL | 400 | 400 | green | up |

The chart used to take its colour from *today's* change, so a year-long
decline could render green. It now colours by the window it draws - verified
above by the colour flipping at exactly the range where the DB direction flips.
RKLB shows the mirror case (1W green, 1M/3M red, 1Y green), matching its data.

### Portfolio chart and per-holding sparklines - **PASS**

| Range | drawn | expected | stroke |
|---|---|---|---|
| 1D | empty state | - | - |
| 1W | 8 | 8 | **red** |
| 1M | 31 | 31 | green |
| 3M | 91 | 91 | green |
| 1Y | 366 | 366 | green |
| ALL | 539 | 539 | green |

The 1W red is the fix working: the line and its fill were hardcoded to the
accent green whatever the portfolio did. Per-holding 30-day sparklines were
compared **point for point** against the last 30 closes in the database, using
the component's own coordinate formula - AAPL, MSFT and BTC all match exactly.
Row colour follows the holding's gain/loss (AAPL +36.0% green, and the row's
own figures agree with the DB).

### Dashboard summary chart - **PASS**

The dashboard sparkline is the *same series* as the Portfolio page's 1M chart:
31 points, and the SVG points match the 1M portfolio-value series recomputed
from the database exactly. Stroke green, and the series does rise
(60,950.78 → 61,387.38). It was previously hardcoded green regardless.

### Compare page - **PASS**

Three tickers on one shared, date-keyed timeline (3 lines, one legend, one
tooltip listing all three at the same date).

| | AAPL | MSFT | BTC |
|---|---|---|---|
| Compare card | $315.73 / -0.70% | $487.12 / -0.74% | $118,432.50 / +1.32% |
| That ticker's own page | $315.73 / -0.70% | $487.12 / -0.74% | $118,432.50 / +1.32% |
| Compare table | $315.73 | $487.12 | $118,432.50 |
| Market cap | $4.69T | $3.62T | **$2.36T** |

No months-stale divergence between Compare and the detail pages. BTC's market
cap used to print "-" here while Markets showed it, because a coin has no
shares outstanding and only Markets read `crypto_metrics`.

Colour: the summary sparklines are the series-identity colours
(green/blue/amber) and they now match the chart legend exactly. Each card's
label reads `3M · same window as the chart` - and it is: the sparkline had been
plotting the full 400-bar history under a label naming the selected timeframe
(65 points for a 3M equity, 91 for BTC's 3M, which trades weekends).

### Watchlist sparklines - **PASS**

30-day sparkline points match the DB's last 30 closes exactly for AAPL, RKLB
and BTC. Colour follows the change figure (AAPL red at -0.70%, RKLB and BTC
green). The list header now carries the freshness label.

### Markets / Screener sparklines - **PASS (Markets), N/A (Screener)**

Markets' 12-point trend column matches the DB's last 12 closes exactly for
AAPL, RKLB and BTC, and its stroke follows the sign of the change. The Screener
table renders **no** sparkline column at all - the data is computed but not
drawn, so there is nothing there to be wrong; flagged for design-lead rather
than invented here.

### Sector heat map - **PASS**

13 sectors render (it was a 500 before this pass). Tile colour is real:

| Tile | % shown | DB change | Rendered background |
|---|---|---|---|
| AAPL | -0.70% | -0.700588 | `rgba(217,108,108,0.27)` |
| BTC | +1.32% | +1.320646 (rolling 24h) | `rgba(47,198,133,0.376)` |
| RKLB | +0.96% | +0.956294 | `rgba(47,198,133,0.314)` |

Opacity is `0.15 + min(|pct|/5, 1) * 0.85`, so 1.32% → 0.374 and 0.70% → 0.269;
both match to the third decimal. Direction and intensity are the data.

### Charts in AI analysis / briefing cards - **none exist**

Checked in the browser: `/assistant`, `/research`, `/alerts`, `/calendar` and
`/news` contain zero chart elements (no recharts wrapper, no data polylines).
The only charts in the product are the eight above. Nothing to drift out of
sync, which is worth stating rather than leaving to be assumed.

## 2.3 Cross-page consistency - **PASS**

Three tickers, one moment, every surface that shows them:

| Surface | AAPL | RKLB (long tail) | BTC (crypto) |
|---|---|---|---|
| Database | $315.73 / -0.70% | $76.34 / +0.96% | $118,432.50 / +1.32% |
| Ticker detail | $315.73 / -0.70% | $76.34 / +0.96% | $118,432.50 / +1.32% |
| Markets | $315.73 / -0.70% | $76.34 / +0.96% | $118,432.50 / +1.32% |
| Screener | $315.73 / -0.70% | $76.34 / +0.96% | $118,432.50 / +1.32% |
| Watchlist | $315.73 / -0.70% | $76.34 / +0.96% | $118,432.50 / +1.32% |
| Compare | $315.73 / -0.70% | $76.34 / +0.96% | $118,432.50 / +1.32% |
| Portfolio | $315.73 (held) | not held | $118,432.50 (held) |
| Sector map | -0.70% | +0.96% | +1.32% |

BTC is the one that used to disagree: Markets read CoinGecko's rolling 24-hour
change while the ticker page derived one from two daily closes. Every surface
now routes through `cryptoRolling24hFor()`, so the choice is made once - rolling
24h for a market that never closes, close-to-close for session-based markets -
and the Compare table carries a footnote saying exactly that.

## 2.4 Staleness honesty - **PASS**

No live-quote provider is configured, so every price in Cairn is a stored daily
close. One shared `<DataFreshness>` component now says so in the same words on
the ticker header, the ticker chart card, Markets, Screener, Watchlists, the
Portfolio chart, every Compare card and Base Camp:

```
DELAYED · CLOSE OF AUG 21, 2026
```

It names the actual date of the bar, not just "delayed", and it flips to "Live"
if a quote provider is ever configured rather than disappearing. Nothing was
removed to make the UI look more polished: the label went from one surface to
all of them.

## 2.5 Refresh-rate honesty - **PASS**

The auto-refresh timer is real (`useLiveRefresh`, market-hours- and
visibility-gated), but two claims around it were not:

- The dashboard pill read **"Live"** next to delayed closes. It now reads
  **"Auto-refresh · 30s"** / "Auto-refresh paused" / "Market closed" - it
  reports what it actually controls, which is whether the page re-runs its
  queries.
- Settings offered a **10 second** interval that `useLiveRefresh` silently
  floored to 15. The option is now 15 seconds, and the hint says the refresh
  re-runs Base Camp's queries and does *not* make prices live.

---

## Also fixed on the way past

- Screener's P/E cell rendered `42.600d7` - a mangled `×` escape.
- `/ticker/^GSPC` looked up the literal string `%5EGSPC`: the route segment is
  percent-encoded for index and forex symbols and was never decoded.
- Equity and ETF names came from a seven-symbol hardcoded map, so every other
  symbol printed its asset type where a company name belongs. Names now come
  from the provider at ingest (`symbol_directory.name`), with the static map
  kept only as a fallback for rows ingested before the directory existed.

## Not fixed, and why

- **Intraday (1D / 1W) still needs a keyed provider.** Both charts render an
  honest empty state explaining that stored prices are one close per day. No
  change: inventing an intraday line from daily closes is the failure mode this
  pass exists to remove.
- **The Screener has no trend column.** Data is there; drawing it is a design
  decision for design-lead.
- **`symbol_directory.name` is null for symbols ingested before 0027** until
  their next refresh. The name fallback chain covers it in the meantime.
- **Live provider reachability is unverified in this session** - see the
  opening note. The provider path is exercised end to end against a
  shape-identical local server, but a run against the real endpoints is still
  owed before this ships.
