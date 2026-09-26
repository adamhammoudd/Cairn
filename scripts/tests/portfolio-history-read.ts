// Regression test for fix/portfolio-chart-history.
//
// /portfolio (and Base Camp's sparkline) read chart history with ONE call:
// recent_prices(symbols, per_symbol: 1500). The API returns at most 1000 rows
// per response, and recent_prices returns symbol by symbol, so on the
// founder's account (NVDA, AMZN, ISRG, BTC: 5,267 rows on 2026-09-26) the
// chart got NVDA's first 1000 bars and nothing else: "cut short at the
// database's read limit", 1 of 4 positions plotted. #136 added the paged
// reader but did not route this read through it.
//
// The stand-in client below behaves like PostgREST: every response is capped
// at 1000 rows, and .order()/.range() are applied the way the API applies them.
//
// Run: npx tsx --conditions=react-server scripts/tests/portfolio-history-read.ts

import { pathToFileURL } from "node:url";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { readRecentPrices } from "@/lib/market-data/paged-read";
import { DataReadError } from "@/lib/supabase/read";
import { computeTimelineSeries, timelineCoverage, type Holding, type PriceBar } from "@/lib/portfolio";
import { writeReport, type SuiteResult, type TestCase } from "./report";

const ROW_CAP = 1000;

// Stored bars per symbol for the founder's holdings, live on 2026-09-26
// (SELECT count(*) FROM recent_prices(ARRAY[...], 1500) = 5,267).
const LIVE = [
  { symbol: "AMZN", asset_type: "equity", bars: 1255 },
  { symbol: "BTC", asset_type: "crypto", bars: 1500 },
  { symbol: "ISRG", asset_type: "equity", bars: 1256 },
  { symbol: "NVDA", asset_type: "equity", bars: 1256 },
];

function day(i: number): string {
  return new Date(Date.UTC(2026, 8, 25) - i * 86_400_000).toISOString().slice(0, 10);
}

/** recent_prices() output for `symbols`, in the function's own order (unnest order, newest first). */
function recentPrices(symbols: string[], perSymbol: number): PriceBar[] {
  return symbols.flatMap((s) => {
    const f = LIVE.find((l) => l.symbol === s);
    if (!f) return [];
    return Array.from({ length: Math.min(f.bars, perSymbol, 2000) }, (_, i) => ({
      id: i,
      symbol: s,
      asset_type: f.asset_type as PriceBar["asset_type"],
      ts: day(i),
      open: 100,
      high: 100,
      low: 100,
      close: 100 + (i % 7),
      volume: 1,
    }));
  });
}

interface Calls {
  requests: number;
  ordered: string[];
}

/** A PostgREST-like client: rpc() -> builder with order()/range(), awaited responses capped at 1000 rows. */
function fakeClient(calls: Calls, failAtPage?: number): SupabaseClient<Database> {
  return {
    rpc(_name: string, args: { symbols: string[]; per_symbol: number }) {
      let rows = recentPrices(args.symbols, args.per_symbol);
      const orders: [keyof PriceBar, boolean][] = [];
      let from = 0;
      let to = Number.MAX_SAFE_INTEGER;
      const builder = {
        order(col: keyof PriceBar, opts?: { ascending?: boolean }) {
          orders.push([col, opts?.ascending !== false]);
          calls.ordered.push(`${String(col)}:${opts?.ascending === false ? "desc" : "asc"}`);
          return builder;
        },
        range(a: number, b: number) {
          from = a;
          to = b;
          return builder;
        },
        then(resolve: (r: unknown) => void) {
          calls.requests++;
          if (failAtPage !== undefined && calls.requests === failAtPage) {
            resolve({ data: null, error: { message: "canceling statement due to statement timeout", code: "57014" } });
            return;
          }
          if (orders.length) {
            rows = rows.slice().sort((x, y) => {
              for (const [c, asc] of orders) {
                const a = String(x[c]);
                const b = String(y[c]);
                if (a !== b) return (a < b ? -1 : 1) * (asc ? 1 : -1);
              }
              return 0;
            });
          }
          const slice = rows.slice(from, Math.min(to + 1, from + ROW_CAP));
          resolve({ data: slice, error: null, count: null });
        },
      };
      return builder;
    },
  } as unknown as SupabaseClient<Database>;
}

const holdings: Holding[] = LIVE.map((l) => ({
  symbol: l.symbol,
  quantity: 1,
  purchase_price: 50,
  asset_type: l.asset_type,
  purchase_date: "2021-01-01",
})) as unknown as Holding[];
const symbols = ["NVDA", "AMZN", "ISRG", "BTC"];

export async function runPortfolioHistoryReadSuite(): Promise<SuiteResult> {
  const cases: TestCase[] = [];
  const check = (name: string, ok: boolean, detail: string) => cases.push({ name, status: ok ? "pass" : "fail", detail });

  // The defect, reproduced: the page's single call.
  const oldCalls: Calls = { requests: 0, ordered: [] };
  const { data: oldRows } = (await fakeClient(oldCalls).rpc("recent_prices", { symbols, per_symbol: 1500 })) as unknown as { data: PriceBar[] };
  const oldCover = timelineCoverage(holdings, oldRows);
  check(
    "the old single read returns 1000 of 5,267 rows and covers 1 of 4 holdings (the defect)",
    oldRows.length === 1000 && oldCover.covered.join(",") === "NVDA",
    `${oldRows.length} rows; covered ${oldCover.covered.join(",")}; missing ${oldCover.missing.join(",")}`,
  );

  // The fix.
  const calls: Calls = { requests: 0, ordered: [] };
  const rows = await readRecentPrices(fakeClient(calls), symbols, 1500);
  check("paged read returns all 5,267 rows", rows.length === 5267, `${rows.length} rows in ${calls.requests} requests`);
  const perSymbol = Object.fromEntries(symbols.map((s) => [s, rows.filter((r) => r.symbol === s).length]));
  check(
    "every holding gets its full history (NVDA 1256, AMZN 1255, ISRG 1256, BTC 1500)",
    perSymbol.NVDA === 1256 && perSymbol.AMZN === 1255 && perSymbol.ISRG === 1256 && perSymbol.BTC === 1500,
    JSON.stringify(perSymbol),
  );
  const keys = new Set(rows.map((r) => `${r.symbol}|${r.asset_type}|${r.ts}`));
  check("no row read twice or skipped between pages", keys.size === rows.length, `${keys.size} distinct of ${rows.length}`);
  check(
    "pages are taken over a stable order (symbol, asset_type, ts desc)",
    calls.ordered.slice(0, 3).join(" ") === "symbol:asc asset_type:asc ts:desc",
    calls.ordered.slice(0, 3).join(" "),
  );
  const cover = timelineCoverage(holdings, rows);
  check("chart coverage: all 4 holdings, none missing", cover.covered.length === 4 && cover.missing.length === 0, `covered ${cover.covered.join(",")}`);
  const all = computeTimelineSeries(holdings, rows, "ALL");
  check("ALL timeline spans the full 1500 days of BTC history", all.length > 0 && all[0].date === day(1499), `${all.length} points from ${all[0]?.date}`);

  const small: Calls = { requests: 0, ordered: [] };
  const one = await readRecentPrices(fakeClient(small), ["NVDA"], 30);
  check("a small read is still one request", one.length === 30 && small.requests === 1, `${one.length} rows, ${small.requests} request(s)`);
  const none = await readRecentPrices(fakeClient({ requests: 0, ordered: [] }), [], 1500);
  check("no symbols: no request, empty", none.length === 0, `${none.length}`);

  let thrown: unknown = null;
  try {
    await readRecentPrices(fakeClient({ requests: 0, ordered: [] }, 3), symbols, 1500);
  } catch (e) {
    thrown = e;
  }
  check(
    "a failed page throws a DataReadError (the page shows 'data unavailable', not a short chart)",
    thrown instanceof DataReadError,
    thrown instanceof Error ? thrown.message : String(thrown),
  );

  return { suiteName: "Portfolio chart history read past the 1000-row cap", gating: true, cases };
}

async function main() {
  const suite = await runPortfolioHistoryReadSuite();
  const reportPath = writeReport([suite]);
  console.log(`Report written to ${reportPath}`);
  const failed = suite.cases.filter((c) => c.status === "fail");
  for (const c of suite.cases) console.log(`${c.status === "pass" ? "PASS" : "FAIL"}: ${c.name} - ${c.detail}`);
  console.log(`${suite.cases.length - failed.length}/${suite.cases.length} passed.`);
  if (failed.length > 0) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
