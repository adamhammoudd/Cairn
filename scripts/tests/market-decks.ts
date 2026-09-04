// Regression test for lib/market-decks.ts - the 2026-09-04 walkthrough's
// finding #4: switching between Day gainers / Day losers / Most active /
// Most searched on /markets updated the stat-card row but left the ranked
// table underneath frozen on whatever order it loaded with.
//
// Root cause: TrendingDeck owned the selected deck as its own local state,
// and MarketsPanel's table sorted only by asset-type tab + search query -
// nothing connected the two. This tests the shared ranking (deckValue /
// deckComparator / deckHasSignal) that now backs both the card row and the
// full table, so they can't drift apart again.
//
// Run: npx tsx --conditions=react-server scripts/tests/market-decks.ts

import { deckComparator, deckHasSignal, deckValue, type DeckId } from "../../src/lib/market-decks";
import type { ScreenerRow } from "../../src/lib/screener";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "pass" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
  ok ? pass++ : fail++;
}

function row(over: Partial<ScreenerRow>): ScreenerRow {
  return {
    symbol: "SYM",
    assetType: "equity",
    name: null,
    price: 100,
    changePct: null,
    volume: null,
    marketCap: null,
    trend: [],
    asOf: null,
    ...over,
  } as ScreenerRow;
}

const ROWS: ScreenerRow[] = [
  row({ symbol: "AAA", changePct: 5, volume: 100 }),
  row({ symbol: "BBB", changePct: -3, volume: 500 }),
  row({ symbol: "CCC", changePct: 8, volume: 50 }),
  row({ symbol: "DDD", changePct: null, volume: null }), // no data at all
];
const REQUEST_COUNTS = { AAA: 10, BBB: 2, CCC: 10 };

function sortedSymbols(deck: DeckId, rows = ROWS, counts = REQUEST_COUNTS) {
  return [...rows].sort(deckComparator(deck, counts)).map((r) => r.symbol);
}

// --- 1. Gainers: largest change first, no-data row sinks to the end ----------
check(
  "gainers: CCC (+8) > AAA (+5) > BBB (-3) > DDD (no data, last)",
  sortedSymbols("gainers").join(",") === "CCC,AAA,BBB,DDD",
  sortedSymbols("gainers").join(","),
);

// --- 2. Losers: most negative first ------------------------------------------
check(
  "losers: BBB (-3) first, no-data row still sinks to the end",
  sortedSymbols("losers").join(",") === "BBB,AAA,CCC,DDD",
  sortedSymbols("losers").join(","),
);

// --- 3. Active: highest volume first ------------------------------------------
check(
  "active: BBB (500) > AAA (100) > CCC (50), DDD (no volume) last",
  sortedSymbols("active").join(",") === "BBB,AAA,CCC,DDD",
  sortedSymbols("active").join(","),
);

// --- 4. Searched: highest request count first, tie broken alphabetically -----
check(
  "searched: AAA and CCC tie at 10 (alpha tiebreak), BBB (2) next, DDD (0) last",
  sortedSymbols("searched").join(",") === "AAA,CCC,BBB,DDD",
  sortedSymbols("searched").join(","),
);

// --- 5. The exact reported bug: this table order actually changes per deck --
{
  const gainersOrder = sortedSymbols("gainers");
  const losersOrder = sortedSymbols("losers");
  const activeOrder = sortedSymbols("active");
  const searchedOrder = sortedSymbols("searched");
  const allDistinctPairs = [
    [gainersOrder, losersOrder],
    [gainersOrder, activeOrder],
    [gainersOrder, searchedOrder],
  ];
  check(
    "every deck produces a genuinely different table order (not frozen on gainers)",
    allDistinctPairs.every(([a, b]) => a.join(",") !== b.join(",")),
  );
}

// --- 6. deckValue: null when a row has nothing to rank on for that deck ------
check("deckValue: gainers/losers read changePct", deckValue(ROWS[0], "gainers", REQUEST_COUNTS) === 5);
check("deckValue: active reads volume", deckValue(ROWS[1], "active", REQUEST_COUNTS) === 500);
check("deckValue: searched is null when request count is 0", deckValue(row({ symbol: "ZZZ" }), "searched", {}) === null);

// --- 7. deckHasSignal: "searched" needs real differentiation to mean anything --
check("searched, all equal counts: no signal", deckHasSignal(ROWS, "searched", { AAA: 3, BBB: 3, CCC: 3 }) === false);
check("searched, nothing searched at all: no signal", deckHasSignal(ROWS, "searched", {}) === false);
check("searched, counts differ: has signal", deckHasSignal(ROWS, "searched", REQUEST_COUNTS) === true);
check("gainers/losers/active always have signal (no such gate)", deckHasSignal(ROWS, "gainers", {}) === true);

console.log(`\n${pass}/${pass + fail} market-decks cases passed`);
process.exit(fail === 0 ? 0 : 1);
