// History depth (fix/history-depth).
//
// 1. Full history on ingest: a symbol the provider holds for decades must come
//    back with all of it, not a 2-year slice - and never as monthly bars
//    mislabelled as daily (Yahoo's own range=max does exactly that).
// 2. A genuinely young symbol explains itself: "BLORB has only 4 days of price
//    history, too new to compare with its own past", with a benchmark base rate
//    that is labelled as the benchmark's record - not an error, not a dead end.
// 3. The minimum-sample rule is unchanged (252 bars).
//
// The provider is replaced by an in-process fake (no network, no database):
// probeProviderHistory runs the same URL builder and parser as ingest.
//
// Run: npx tsx --conditions=react-server scripts/tests/history-depth.ts

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chartRangeQuery, probeProviderHistory, FULL_HISTORY_RANGE, isDailyGranularity } from "@/lib/market-data/ingest";
import { youngHistory, youngHistoryMessage, isTooYoung, historyLengthWords } from "@/lib/ai/history-depth";
import { MIN_FACTOR_HISTORY_BARS, type FactorBar } from "@/lib/ai/factors";
import { selectBackfillCandidates, pricesAgree } from "../backfill-history";
import { renderComponentText } from "./render-helper";
import { writeReport, type SuiteResult, type TestCase } from "./report";

function check(name: string, ok: boolean, detail: string): TestCase {
  return { name, status: ok ? "pass" : "fail", detail };
}

const DAY = 86_400;

/** A fake Yahoo chart response: `n` daily bars ending today, or at `granularity`. */
function chartJson(n: number, instrumentType: string, granularity = "1d") {
  const end = Math.floor(Date.UTC(2026, 8, 25) / 1000);
  const timestamp = Array.from({ length: n }, (_, i) => end - (n - 1 - i) * DAY);
  const close = timestamp.map((_, i) => 100 + Math.sin(i / 20) * 5 + i * 0.01);
  return {
    chart: {
      result: [
        {
          meta: { instrumentType, dataGranularity: granularity, symbol: "X" },
          timestamp,
          indicators: { quote: [{ open: close, high: close, low: close, close, volume: close.map(() => 1000) }] },
        },
      ],
    },
  };
}

function syntheticBars(n: number): FactorBar[] {
  const start = Date.UTC(2018, 0, 1);
  let price = 100;
  return Array.from({ length: n }, (_, i) => {
    // Deterministic wobble with a slight upward drift.
    price *= 1 + Math.sin(i * 1.7) * 0.02 + 0.0004;
    return { date: new Date(start + i * DAY * 1000).toISOString().slice(0, 10), close: Number(price.toFixed(4)), volume: 1000 };
  });
}

export async function runHistoryDepthSuite(): Promise<SuiteResult> {
  const cases: TestCase[] = [];
  const requested: string[] = [];

  // ---- 1. full history -----------------------------------------------------
  cases.push(check("'max' is sent as period1=0..now, never as range=max", chartRangeQuery(FULL_HISTORY_RANGE, 1_790_000_000_000) === "period1=0&period2=1790000000", chartRangeQuery(FULL_HISTORY_RANGE, 1_790_000_000_000)));
  cases.push(check("other ranges pass through", chartRangeQuery("2y") === "range=2y", chartRangeQuery("2y")));
  cases.push(check("only daily (or undeclared) granularity is accepted", isDailyGranularity("1d") && isDailyGranularity(undefined) && !isDailyGranularity("3mo") && !isDailyGranularity("1mo"), "1d/undefined ok; 3mo/1mo refused"));

  {
    // The fake provider: full daily history for period1=0, a 2-year slice for
    // range=2y, and monthly bars for range=max (what Yahoo really does).
    // Injected, not assigned to globalThis.fetch: run-all runs suites in
    // parallel and they share the global.
    const fakeProvider = (async (input: string | URL | Request) => {
      const url = String(input);
      requested.push(url);
      const body = url.includes("period1=0") ? chartJson(11_539, "EQUITY") : url.includes("range=max") ? chartJson(169, "EQUITY", "3mo") : chartJson(505, "EQUITY");
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    const deep = await probeProviderHistory("AAPL", "equity", FULL_HISTORY_RANGE, fakeProvider);
    cases.push(check("a 2y-only equity gets its full history at FULL_HISTORY_RANGE", deep.ok && deep.bars === 11_539, JSON.stringify(deep)));
    cases.push(check("...and the request used period1=0", requested.at(-1)?.includes("period1=0&period2=") === true, requested.at(-1) ?? "none"));
    const shallow = await probeProviderHistory("AAPL", "equity", "2y", fakeProvider);
    cases.push(check("an explicit 2y still returns 2 years (refresh window unchanged)", shallow.ok && shallow.bars === 505, JSON.stringify(shallow)));

    const monthlyProvider = (async () => new Response(JSON.stringify(chartJson(169, "EQUITY", "3mo")), { status: 200 })) as typeof fetch;
    const monthly = await probeProviderHistory("AAPL", "equity", FULL_HISTORY_RANGE, monthlyProvider);
    cases.push(check("monthly bars are refused, never stored as daily", !monthly.ok && /3mo/.test(monthly.detail), JSON.stringify(monthly)));
  }

  const ingestSrc = fs.readFileSync(path.resolve(process.cwd(), "src/lib/market-data/ingest.ts"), "utf8");
  cases.push(check("ensureSymbolIngested's first fetch defaults to FULL_HISTORY_RANGE (was \"2y\")", /fetchChart\(candidate, options\.range \?\? FULL_HISTORY_RANGE\)/.test(ingestSrc) && !/options\.range \?\? "2y"/.test(ingestSrc), "source"));
  const edgeSrc = fs.readFileSync(path.resolve(process.cwd(), "supabase/functions/_shared/market-adapters.ts"), "utf8");
  cases.push(check("the edge adapter sends max as period1=0 and refuses non-daily bars", /period1=0&period2=/.test(edgeSrc) && /not daily/.test(edgeSrc), "source"));
  const refreshSrc = fs.readFileSync(path.resolve(process.cwd(), "supabase/functions/ingest-market-data/index.ts"), "utf8");
  cases.push(check("the daily refresh writes the STORED bar count, not the 2y fetch size", /bars: storedAfter/.test(refreshSrc) && !/kind: "success", bars: bars\.length/.test(refreshSrc), "source"));

  // ---- backfill selection ------------------------------------------------------
  const today = new Date("2026-09-27T00:00:00Z");
  const picked = selectBackfillCandidates(
    [
      { symbol: "AAPL", assetType: "equity", bars: 1256, firstTs: "2021-09-24" },
      { symbol: "SPY", assetType: "etf", bars: 505, firstTs: "2024-09-27" },
      { symbol: "BTC", assetType: "crypto", bars: 731, firstTs: "2024-09-27" },
      { symbol: "BLORB", assetType: "crypto", bars: 4, firstTs: "2026-09-24" },
      { symbol: "ZAMA", assetType: "crypto", bars: 234, firstTs: "2026-01-30" },
      // Clipped by CoinGecko's 365-day window, not young.
      { symbol: "ETH", assetType: "crypto", bars: 405, firstTs: "2025-08-18" },
    ],
    today,
  ).map((r) => r.symbol);
  cases.push(check("backfill takes every equity/ETF and the clipped coins", picked.join(",") === "AAPL,SPY,BTC,ETH", picked.join(",")));
  cases.push(check("backfill skips young coins that already hold their full history", !picked.includes("BLORB") && !picked.includes("ZAMA"), picked.join(",")));

  const stored30 = Array.from({ length: 30 }, (_, i) => ({ ts: `2026-09-${String(i + 1).padStart(2, "0")}`, close: 100 + i }));
  cases.push(check("identity check passes the same series (tiny provider rounding)", pricesAgree(stored30, stored30.map((r) => ({ ...r, close: r.close * 1.001 }))).ok, JSON.stringify(pricesAgree(stored30, stored30))));
  const etf = pricesAgree(stored30.map((r) => ({ ...r, close: r.close * 1000 })), stored30.map((r) => ({ ...r, close: 37 })));
  cases.push(check("identity check refuses a different instrument under the same ticker (the $37 BTC case)", !etf.ok, JSON.stringify(etf)));
  const fewShared = pricesAgree(stored30.slice(0, 3), stored30);
  cases.push(check("identity check refuses when fewer than 5 dates overlap (can't tell)", !fewShared.ok && fewShared.shared === 3, JSON.stringify(fewShared)));

  // ---- 2. young symbols -----------------------------------------------------------
  cases.push(check("the plain message, exactly", youngHistoryMessage("BLORB", 4, "crypto") === "BLORB has only 4 days of price history, too new to compare with its own past.", youngHistoryMessage("BLORB", 4, "crypto")));
  cases.push(check("shares are counted in trading days", historyLengthWords(73, "equity") === "73 trading days", historyLengthWords(73, "equity")));
  cases.push(check("one bar is singular", historyLengthWords(1, "crypto") === "1 day", historyLengthWords(1, "crypto")));
  cases.push(check("nothing stored reads plainly too", /no stored price history yet/.test(youngHistoryMessage("MCAT", 0, "crypto")), youngHistoryMessage("MCAT", 0, "crypto")));

  const btc = syntheticBars(1500);
  const blorb = youngHistory("BLORB", 4, "crypto", btc);
  cases.push(check("a young coin gets a BTC comparison", blorb.benchmark === "BTC" && blorb.comparison !== null, String(blorb.comparison)));
  cases.push(check("the comparison is labelled as the market's record, not the coin's", /^For comparison, /.test(blorb.comparison ?? "") && /not BLORB's\.$/.test(blorb.comparison ?? "") && /Bitcoin \(BTC\)/.test(blorb.comparison ?? ""), String(blorb.comparison)));
  cases.push(check("the comparison never reads as BLORB's own history", !/BLORB (was|ended|has been) higher/.test(blorb.comparison ?? ""), String(blorb.comparison)));
  const spcx = youngHistory("SPCX", 73, "equity", btc);
  cases.push(check("a young share is compared with the S&P 500 (SPY)", spcx.benchmark === "SPY" && /S&P 500 \(SPY\)/.test(spcx.comparison ?? "") && /two-week stretch/.test(spcx.comparison ?? ""), String(spcx.comparison)));
  const noBench = youngHistory("BLORB", 4, "crypto", syntheticBars(100));
  cases.push(check("no comparison when the benchmark itself is too thin (never invented)", noBench.comparison === null && /only 4 days/.test(noBench.message), JSON.stringify(noBench)));

  // The analysis action turns the thin-data failure into this, not an error.
  const actionSrc = fs.readFileSync(path.resolve(process.cwd(), "src/lib/actions/analysis.ts"), "utf8");
  cases.push(check("a thin-data failure on a young ticker returns kind 'unavailable' with the young message", /kind: "unavailable", message: young\?\.message \?\? UNAVAILABLE_MESSAGE, \.\.\.\(young \? \{ young \} : \{\}\)/.test(actionSrc), "source"));

  const panel = renderComponentText("src/components/analysis/research-states.tsx", "UnavailablePanel", { young: blorb });
  cases.push(check("the panel shows 'Too new to compare with its own past' and the plain message", /Too new to compare with its own past/.test(panel) && /BLORB has only 4 days of price history/.test(panel), panel.slice(0, 240)));
  cases.push(check("the panel labels the comparison as a market base rate", /Market base rate, for comparison/i.test(panel) && /not BLORB's/.test(panel), panel.slice(0, 400)));
  cases.push(check("the young panel does not show the generic 'not enough data' refusal", !/Not enough history for a reliable read/.test(panel), panel.slice(0, 200)));
  const generic = renderComponentText("src/components/analysis/research-states.tsx", "UnavailablePanel", {});
  cases.push(check("without young info the generic panel is unchanged", /Not enough history for a reliable read/.test(generic), generic.slice(0, 120)));

  // ---- 3. rules unchanged -----------------------------------------------------------
  cases.push(check("minimum history for the analog scan is still 252 bars (unchanged)", MIN_FACTOR_HISTORY_BARS === 252 && isTooYoung(251) && !isTooYoung(252), String(MIN_FACTOR_HISTORY_BARS)));

  return { suiteName: "History depth (full ingest, young symbols explain themselves)", gating: true, cases };
}

async function main() {
  const suite = await runHistoryDepthSuite();
  console.log(`Report written to ${writeReport([suite])}`);
  const failed = suite.cases.filter((c) => c.status === "fail");
  for (const c of failed) console.log(`FAIL: ${c.name} - ${c.detail}`);
  console.log(`${suite.cases.length - failed.length}/${suite.cases.length} passed.`);
  if (failed.length > 0) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
