// Regression test for fix/recent-prices-row-cap: two reads still trusted a
// single PostgREST response to hold everything they asked for.
//
// 1. Ticker chart. getTickerData asks for CHART_BAR_LIMIT = 2000 bars in one
//    request, but Supabase's API returns at most 1000 rows per response
//    (live-confirmed in PR #132: "206, Content-Range 0-999/4435"). On
//    2026-09-26, 17 symbols had more than 1000 stored bars (NVDA, MSFT, AMZN,
//    ISRG: 1255-1256; ADA: 1827), so "ALL" showed about 4 of their 5 years.
//
// 2. Daily briefing price moves (src/lib/ai/briefing.ts and the
//    generate-daily-briefings edge function). Both read the newest bars for
//    all held symbols through ONE shared window: `.in(symbols).order(ts
//    desc).limit(symbols.length * 3)`. A symbol whose newest bar is older than
//    the others (BTC was 5 days stale on 2026-09-04) falls out of that window
//    and silently gets no move. recent_prices() gives each symbol its own
//    limit; supabase/tests/price_ordering.sql proves the SQL side.
//
// 3. Compare (src/lib/actions/comparison.ts) and alert evaluation
//    (supabase/functions/evaluate-alerts) called recent_prices() for several
//    symbols in ONE request: Compare at 400 bars each, alerts at 250. Past the
//    1000-row cap the symbols at the end got no bars - a fourth Compare symbol
//    dropped out of the table, and a fifth watched symbol's alerts stopped
//    evaluating. Both now page the call, ordered by symbol then newest-first.
//
// Run: npx tsx --conditions=react-server scripts/tests/price-row-cap.ts

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readNewestFirstPaged, API_MAX_ROWS } from "@/lib/market-data/paged-read";
import { priceMovesFromBars } from "../../supabase/functions/_shared/price-moves";
import { writeReport, type SuiteResult, type TestCase } from "./report";

interface Bar {
  symbol: string;
  ts: string;
  close: number;
}

/** A stand-in for one PostgREST request: newest-first, capped at 1000 rows. */
function fakeTable(rows: Bar[]) {
  const newestFirst = rows.slice().sort((a, b) => (a.ts < b.ts ? 1 : -1));
  return (from: number, to: number) => {
    const wanted = newestFirst.slice(from, to + 1);
    return Promise.resolve({ data: wanted.slice(0, API_MAX_ROWS), error: null });
  };
}

function isoDay(offset: number): string {
  const d = new Date(Date.UTC(2026, 8, 25));
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
}

export async function runPriceRowCapSuite(): Promise<SuiteResult> {
  const cases: TestCase[] = [];
  const check = (name: string, ok: boolean, detail: string) => cases.push({ name, status: ok ? "pass" : "fail", detail });

  // --- 1. the chart read --------------------------------------------------------
  const nvda: Bar[] = Array.from({ length: 1256 }, (_, i) => ({ symbol: "NVDA", ts: isoDay(i), close: 100 + i }));
  const fetchPage = fakeTable(nvda);

  // The defect, reproduced: one request for 2000 rows comes back with 1000.
  const single = await fetchPage(0, 1999);
  check(
    "one request for 2000 bars returns only 1000 (the defect)",
    single.data.length === 1000,
    `asked for 2000, got ${single.data.length} of 1256 stored`,
  );

  const paged = await readNewestFirstPaged(fetchPage, 2000);
  check("the paged read returns every stored bar", paged.length === 1256, `got ${paged.length} of 1256`);
  check(
    "the paged read keeps newest-first order across the page boundary",
    paged[0].ts === isoDay(0) && paged[999].ts === isoDay(999) && paged[1000].ts === isoDay(1000) && paged[1255].ts === isoDay(1255),
    `${paged[0].ts} .. ${paged[999].ts} | ${paged[1000].ts} .. ${paged[1255].ts}`,
  );
  const unique = new Set(paged.map((b) => b.ts)).size;
  check("no bar is read twice at the page boundary", unique === paged.length, `${unique} unique of ${paged.length}`);

  const capped = await readNewestFirstPaged(fetchPage, 1100);
  check("the overall cap is still honoured", capped.length === 1100, `max 1100, got ${capped.length}`);

  let calls = 0;
  const counting = (from: number, to: number) => {
    calls++;
    return fetchPage(from, to);
  };
  await readNewestFirstPaged(counting, 2000);
  check("stops after the short last page (2 requests for 1256 bars)", calls === 2, `${calls} requests`);

  const failing = () => Promise.resolve({ data: null, error: { message: "permission denied" } });
  let threw = "";
  try {
    await readNewestFirstPaged(failing, 2000);
  } catch (err) {
    threw = err instanceof Error ? err.message : String(err);
  }
  check("a failed page throws instead of returning a short history", threw.includes("permission denied"), threw || "did not throw");

  // --- 2. the briefing's price moves -------------------------------------------
  // Three equities current to Friday; BTC's newest bar is five days older.
  const held: Bar[] = [];
  // AMZN moves 1.0% (under the 2% threshold); ISRG and NVDA move 3.1%.
  for (const s of ["AMZN", "ISRG", "NVDA"]) {
    const step = s === "AMZN" ? 1 : 3;
    for (let i = 0; i < 5; i++) held.push({ symbol: s, ts: isoDay(i), close: 100 - i * step });
  }
  held.push({ symbol: "BTC", ts: isoDay(5), close: 70000 }, { symbol: "BTC", ts: isoDay(6), close: 65000 });

  const symbols = ["AMZN", "BTC", "ISRG", "NVDA"];
  const sharedWindow = held
    .slice()
    .sort((a, b) => (a.ts < b.ts ? 1 : -1))
    .slice(0, symbols.length * 3);
  const oldMoves = priceMovesFromBars(sharedWindow, 2);
  check(
    "the shared window drops the stale symbol's move (the defect)",
    !oldMoves.some((m) => m.symbol === "BTC") && oldMoves.some((m) => m.symbol === "NVDA"),
    `moves from the shared window: ${oldMoves.map((m) => m.symbol).join(", ") || "none"}`,
  );

  // recent_prices(symbols, 2): two newest bars per symbol, whatever the others hold.
  const perSymbol = symbols.flatMap((s) =>
    held
      .filter((b) => b.symbol === s)
      .sort((a, b) => (a.ts < b.ts ? 1 : -1))
      .slice(0, 2),
  );
  const moves = priceMovesFromBars(perSymbol, 2);
  const btc = moves.find((m) => m.symbol === "BTC");
  check(
    "with per-symbol bars the stale symbol's move is reported",
    !!btc && btc.change_pct === 7.69 && btc.as_of === isoDay(5),
    btc ? `BTC ${btc.change_pct}% as of ${btc.as_of}` : "BTC missing",
  );
  check(
    "a move is dated by its own newest bar, not today",
    btc?.as_of === isoDay(5),
    `as_of ${btc?.as_of}`,
  );
  check(
    "moves under the threshold are left out",
    !moves.some((m) => m.symbol === "AMZN") && priceMovesFromBars(perSymbol, 10).length === 0,
    `at 2%: ${moves.map((m) => `${m.symbol} ${m.change_pct}%`).join(", ")}`,
  );
  check(
    "input order does not matter (newest bar is chosen by date)",
    JSON.stringify(priceMovesFromBars(perSymbol.slice().reverse(), 2)) === JSON.stringify(moves),
    "reversed input gives the same moves",
  );
  check(
    "a symbol with one bar, a null close or a zero base is skipped, never guessed",
    priceMovesFromBars(
      [
        { symbol: "ONE", ts: isoDay(0), close: 10 },
        { symbol: "NUL", ts: isoDay(0), close: null },
        { symbol: "NUL", ts: isoDay(1), close: 5 },
        { symbol: "ZER", ts: isoDay(0), close: 5 },
        { symbol: "ZER", ts: isoDay(1), close: 0 },
      ],
      0,
    ).length === 0,
    "no moves",
  );

  // --- 3. multi-symbol recent_prices(): Compare and alert evaluation ----------
  // recent_prices() over several symbols, as PostgREST serves it with
  // .order(symbol).order(ts desc).range(): capped at 1000 rows per response.
  const recentPrices = (syms: string[], perSymbol: number) => {
    const rows = syms
      .slice()
      .sort()
      .flatMap((s) => Array.from({ length: perSymbol }, (_, i) => ({ symbol: s, ts: isoDay(i), close: 100 + i })));
    return (from: number, to: number) => Promise.resolve({ data: rows.slice(from, to + 1).slice(0, API_MAX_ROWS), error: null });
  };
  const perSymbolCounts = (rows: Bar[]) =>
    rows.reduce((m, r) => m.set(r.symbol, (m.get(r.symbol) ?? 0) + 1), new Map<string, number>());

  for (const [label, syms, perSymbol] of [
    ["Compare (4 symbols x 400 bars)", ["AMZN", "ISRG", "NVDA", "TSLA"], 400],
    ["alerts (5 symbols x 250 bars)", ["AAPL", "AMZN", "ISRG", "NVDA", "TSLA"], 250],
  ] as const) {
    const page = recentPrices([...syms], perSymbol);
    const one = perSymbolCounts((await page(0, syms.length * perSymbol - 1)).data);
    const last = syms[syms.length - 1];
    check(
      `${label}: one request loses the last symbol (the defect)`,
      !one.has(last),
      `one request: ${syms.map((s) => `${s} ${one.get(s) ?? 0}`).join(", ")}`,
    );
    const pagedRows = await readNewestFirstPaged(page, syms.length * perSymbol);
    const counts = perSymbolCounts(pagedRows);
    check(
      `${label}: the paged read gives every symbol all its bars, once`,
      syms.every((s) => counts.get(s) === perSymbol) && new Set(pagedRows.map((r) => `${r.symbol}|${r.ts}`)).size === pagedRows.length,
      `paged: ${syms.map((s) => `${s} ${counts.get(s) ?? 0}`).join(", ")}`,
    );
    const lastRows = pagedRows.filter((r) => r.symbol === last);
    check(
      `${label}: each symbol's bars stay newest-first (the callers read the first row as latest)`,
      lastRows[0]?.ts === isoDay(0) && lastRows.every((r, i) => i === 0 || r.ts < lastRows[i - 1].ts),
      `${last}: ${lastRows[0]?.ts} .. ${lastRows[lastRows.length - 1]?.ts}`,
    );
  }

  // The wiring: every recent_prices() call in the two callers goes through the
  // paged helper with a total order, never as one capped request.
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const compare = fs.readFileSync(path.join(root, "src/lib/actions/comparison.ts"), "utf8");
  check(
    "src/lib/actions/comparison.ts: bars come from the paged readRecentPrices, never one recent_prices call",
    /readRecentPrices\(supabase, symbols, /.test(compare) && !/\.rpc\(\s*"recent_prices"/.test(compare),
    "readRecentPrices (#150)",
  );
  const alerts = fs.readFileSync(path.join(root, "supabase/functions/evaluate-alerts/index.ts"), "utf8");
  const rpcCalls = [...alerts.matchAll(/\.rpc\(\s*"recent_prices"/g)].map((m) => alerts.slice(m.index, m.index + 400));
  check(
    "supabase/functions/evaluate-alerts: recent_prices() is paged over symbol, asset type, newest-first",
    alerts.includes("readNewestFirstPaged(") &&
      rpcCalls.length > 0 &&
      rpcCalls.every((c) => /\.order\("symbol", \{ ascending: true \}\)\s*\.order\("asset_type", \{ ascending: true \}\)\s*\.order\("ts", \{ ascending: false \}\)\s*\.range\(from, to\)/.test(c)),
    `${rpcCalls.length} recent_prices call(s)`,
  );

  return { suiteName: "Price reads past the 1000-row API cap", gating: true, cases };
}

async function main() {
  const suite = await runPriceRowCapSuite();
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
