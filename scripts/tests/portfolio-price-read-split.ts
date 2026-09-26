// Regression test for the Portfolio-page price read (src/app/(app)/portfolio/page.tsx).
//
// QA pass 2026-09-26: Base Camp showed Total Value $135.04 and /portfolio
// $57.84 for the same four holdings (NVDA, AMZN, ISRG, BTC), and the Holdings
// table showed "-" for three of them. Cause: /portfolio priced its holdings off
// its chart-history read, recent_prices(per_symbol: 1500), which returns 4,435
// rows for those four symbols - and PostgREST caps a response at 1000 rows,
// answering `206 Content-Range: 0-999/4435`. All of the first 1000 rows are
// NVDA, so AMZN, ISRG and BTC reached getLatestCloses with no bars and priced
// as null. Base Camp prices off getLatestCloses' own per_symbol=2 read and
// never hit the cap.
//
// The fix: /portfolio now prices through that same small read and keeps the
// 1500-bar read for the chart only, with isHistoryTruncated() telling the
// chart when it came back short. This suite runs the real getLatestCloses /
// computeTotals / computeConcentration over a fixture shaped like the live
// data, through both reads. It does not render the page (a server component
// needs a request), so the wiring itself was checked by reading the diff.
//
// Run: npx tsx --conditions=react-server scripts/tests/portfolio-price-read-split.ts

// No live-quote key: getLatestCloses falls back to stored bars, the same as
// production today (no Tiingo key until the redistribution licence).
delete process.env.TIINGO_API_KEY;

import { getLatestCloses, groupBarsBySymbol } from "../../src/lib/market-data/current-price";
import {
  computeConcentration,
  computeHoldingMetrics,
  computeTotals,
  type Holding,
} from "../../src/lib/portfolio";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "pass" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
  ok ? pass++ : fail++;
}
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

const ROW_CAP = 1000; // PostgREST max-rows on this project

// Bars available per symbol as of 2026-09-26, in the order recent_prices
// returns them (symbol by symbol, newest first).
const FIXTURE: { symbol: string; asset_type: string; bars: number; last: number }[] = [
  { symbol: "NVDA", asset_type: "equity", bars: 1256, last: 180 },
  { symbol: "AMZN", asset_type: "equity", bars: 1255, last: 220 },
  { symbol: "ISRG", asset_type: "equity", bars: 1256, last: 500 },
  { symbol: "BTC", asset_type: "crypto", bars: 668, last: 110000 },
];

type Bar = Parameters<typeof groupBarsBySymbol>[0][number];

function barsFor(f: (typeof FIXTURE)[number], limit: number): Bar[] {
  const out: Bar[] = [];
  for (let i = 0; i < Math.min(f.bars, limit); i++) {
    const ts = new Date(Date.UTC(2026, 8, 25) - i * 86_400_000).toISOString().slice(0, 10);
    const close = f.last - i; // newest bar = `last`, previous = last - 1
    out.push({ symbol: f.symbol, ts, open: close, high: close, low: close, close, volume: 1, asset_type: f.asset_type });
  }
  return out;
}
const rpc = (perSymbol: number) => FIXTURE.flatMap((f) => barsFor(f, perSymbol));

const holdings: Holding[] = [
  { symbol: "NVDA", quantity: 0.1, purchase_price: 150, asset_type: "equity" },
  { symbol: "AMZN", quantity: 0.1, purchase_price: 200, asset_type: "equity" },
  { symbol: "ISRG", quantity: 0.1, purchase_price: 450, asset_type: "equity" },
  { symbol: "BTC", quantity: 0.0001, purchase_price: 90000, asset_type: "crypto" },
].map((h) => ({ ...h, purchase_date: "2025-01-01" }) as Holding);
const symbols = holdings.map((h) => h.symbol);
const assetTypeBySymbol = new Map(holdings.map((h) => [h.symbol, h.asset_type]));
const expectedTotal = FIXTURE.reduce((s, f) => s + f.last * holdings.find((h) => h.symbol === f.symbol)!.quantity, 0);

async function main() {
  const history = rpc(1500);
  const capped = history.slice(0, ROW_CAP);

  // --- 1. The fixture reproduces the live response -------------------------
  check("history read is past the row cap (4,435 rows live)", history.length === 4435, `${history.length}`);
  check(
    "first 1000 rows are all NVDA, as live",
    capped.every((r) => r.symbol === "NVDA"),
    Array.from(new Set(capped.map((r) => r.symbol))).join(","),
  );

  // --- 2. OLD /portfolio: priced off the capped history read ---------------
  const oldCloses = await getLatestCloses(symbols, groupBarsBySymbol(capped), assetTypeBySymbol);
  const oldTotals = computeTotals(computeHoldingMetrics(holdings, oldCloses), oldCloses);
  const oldNulls = symbols.filter((s) => oldCloses.get(s)?.latest == null);
  check("old read: AMZN, ISRG, BTC price as null (the '-' rows)", oldNulls.join(",") === "AMZN,ISRG,BTC", oldNulls.join(","));
  check("old read: Total Value is NVDA alone (the bug)", near(oldTotals.totalValue, 18), `${oldTotals.totalValue}`);

  // --- 3. NEW /portfolio == Base Camp: getLatestCloses' own per_symbol=2 read
  // Both pages now call getLatestCloses(symbols, undefined, ...), whose
  // lastBars() read is recent_prices(per_symbol: 2) - reproduced here.
  const smallRead = rpc(2);
  check("pricing read is far under the row cap", smallRead.length <= ROW_CAP, `${smallRead.length}`);
  const newCloses = await getLatestCloses(symbols, groupBarsBySymbol(smallRead), assetTypeBySymbol);
  const newMetrics = computeHoldingMetrics(holdings, newCloses);
  const newTotals = computeTotals(newMetrics, newCloses);
  check("new read: every holding priced", symbols.every((s) => newCloses.get(s)?.latest != null));
  check("new read: Total Value covers all four", near(newTotals.totalValue, expectedTotal), `${newTotals.totalValue} vs ${expectedTotal}`);

  // Concentration's implied total (top holding's value / its share) must agree
  // with the Total Value card - the other half of the contradiction.
  const conc = computeConcentration(newMetrics)!;
  const top = newMetrics.find((m) => m.symbol === conc.topSymbol)!;
  const implied = (top.value! / conc.topSharePct) * 100;
  check("Concentration's implied total matches Total Value", near(implied, newTotals.totalValue), `${implied}`);

  console.log(`\n${pass}/${pass + fail} portfolio-price-read-split cases passed`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
