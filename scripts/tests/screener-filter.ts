// Audit 2026-09-04, finding #4: the Screener re-queried the whole tracked
// universe from the DB on every debounced keystroke, and its filter boxes were
// uncontrolled - a preset / reset / saved-screen load changed what was
// filtering but not what the boxes showed.
//
// Fix: applyScreenerFilters (pure, shared) runs client-side over the universe
// already in the browser, and the boxes are controlled off a text mirror.
//
// Run: npx tsx --conditions=react-server scripts/tests/screener-filter.ts

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { applyScreenerFilters, EMPTY_FILTERS, SCREENER_NUMERIC_FIELDS, type ScreenerRow } from "../../src/lib/screener";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "pass" : "FAIL"}  ${name}${!ok && detail ? ` - ${detail}` : ""}`);
  ok ? pass++ : fail++;
}

function row(over: Partial<ScreenerRow>): ScreenerRow {
  return {
    symbol: "X", assetType: "equity", name: null, price: 100, changePct: 1, volume: 1_000_000,
    asOf: "2026-09-04", trend: [], marketCap: 5e9, pe: 20, dividendYield: 2, week52High: 120, week52Low: 80,
    ...over,
  };
}

const universe: ScreenerRow[] = [
  row({ symbol: "AAA", price: 10, changePct: 5, assetType: "equity", pe: 15, dividendYield: 3, marketCap: 2e9 }),
  row({ symbol: "BBB", price: 250, changePct: -2, assetType: "etf", pe: null, dividendYield: null, marketCap: 8e11 }),
  row({ symbol: "CCC", price: 40, changePct: 0.5, assetType: "crypto", pe: null, dividendYield: null, marketCap: null, volume: null }),
];

// --- filtering --------------------------------------------------------
check("no filters returns the whole universe", applyScreenerFilters(universe, EMPTY_FILTERS).length === 3);

check(
  "minPrice excludes cheaper rows",
  applyScreenerFilters(universe, { ...EMPTY_FILTERS, minPrice: 20 }).map((r) => r.symbol).sort().join(",") === "BBB,CCC",
);
check(
  "assetTypes filter",
  applyScreenerFilters(universe, { ...EMPTY_FILTERS, assetTypes: ["crypto", "etf"] }).map((r) => r.symbol).sort().join(",") ===
    "BBB,CCC",
);
check(
  "minChangePct - a null change is excluded, not treated as 0",
  applyScreenerFilters([...universe, row({ symbol: "NUL", changePct: null })], { ...EMPTY_FILTERS, minChangePct: 0 })
    .every((r) => r.symbol !== "NUL"),
);
check(
  "a null P/E is excluded by a P/E filter (not read as 0)",
  applyScreenerFilters(universe, { ...EMPTY_FILTERS, maxPe: 100 }).map((r) => r.symbol).join(",") === "AAA",
);
check(
  "market cap filter works in millions",
  applyScreenerFilters(universe, { ...EMPTY_FILTERS, minMarketCapM: 5000 }).map((r) => r.symbol).join(",") === "BBB",
);
check(
  "results are ordered by change desc",
  applyScreenerFilters(universe, EMPTY_FILTERS).map((r) => r.symbol).join(",") === "AAA,CCC,BBB",
);
check("filtering does not mutate the input array", (() => {
  const before = universe.map((r) => r.symbol).join(",");
  applyScreenerFilters(universe, { ...EMPTY_FILTERS, minPrice: 999 });
  return universe.map((r) => r.symbol).join(",") === before;
})());

// --- the panel: controlled boxes + no per-keystroke DB query --------
const panel = readFileSync(join(import.meta.dirname, "..", "..", "src/components/screener/screener-panel.tsx"), "utf8");

check("the panel filters client-side via applyScreenerFilters", /applyScreenerFilters\(initialRows,/.test(panel));
check("the panel no longer imports runScreen", !/\brunScreen\b/.test(panel));
check("the panel no longer re-queries in a useEffect", !/useEffect/.test(panel));
check("filter inputs are controlled (value= bound to the text mirror)", /value=\{text\[field\]\}/.test(panel));
check(
  "a preset / reset / saved-screen load syncs the visible boxes",
  /function setFilterSet\([\s\S]{0,160}setFilterText\(textFromFilters/.test(panel),
);
check(
  "every numeric filter field is covered by the mirror",
  SCREENER_NUMERIC_FIELDS.every((f) => panel.includes(`field="${f}"`)),
);

console.log(`\n${pass}/${pass + fail} screener-filter cases passed`);
process.exit(fail === 0 ? 0 : 1);
