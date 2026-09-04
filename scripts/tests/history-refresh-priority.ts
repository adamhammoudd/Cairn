// Regression test for compareForHistoryRefresh
// (supabase/functions/_shared/history-refresh-priority.ts) - the E2 fix
// from the 2026-09-04 fix-sweep report.
//
// Root cause: ingest-crypto's history-refresh queue was "stalest first"
// across the whole tracked universe (up to 250 coins) with a fixed 4-coin
// per-run budget - live-confirmed BTC's historical_prices bars were 5 days
// stale despite being the single most-held coin in the app. This is the
// no-cost-impact fix: held/watched symbols always sort ahead of the generic
// long tail, same request budget, no CoinGecko volume increase.
//
// Run: npx tsx --conditions=react-server scripts/tests/history-refresh-priority.ts

import { compareForHistoryRefresh, type HistoryCandidate } from "../../supabase/functions/_shared/history-refresh-priority";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "pass" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
  ok ? pass++ : fail++;
}

function candidate(symbol: string, freshestBarTs: string, marketCapRank: number | null = null): HistoryCandidate {
  return { symbol, freshestBarTs, marketCapRank };
}

function sortSymbols(candidates: HistoryCandidate[], priority: Set<string>) {
  return [...candidates].sort((a, b) => compareForHistoryRefresh(a, b, priority)).map((c) => c.symbol);
}

// --- 1. The exact reported case: BTC held, buried behind a fresher long tail --
{
  const candidates = [
    candidate("SHIB", "2026-09-03", 40), // fresher, not held
    candidate("BTC", "2026-08-30", 1), // 5 days stale, held
    candidate("DOGE", "2026-09-04", 10), // freshest, not held
  ];
  const priority = new Set(["BTC"]);
  check(
    "BTC (held, staler) sorts ahead of fresher unheld coins",
    sortSymbols(candidates, priority)[0] === "BTC",
    sortSymbols(candidates, priority).join(","),
  );
}

// --- 2. Multiple priority symbols: staleness still orders them among themselves --
{
  const candidates = [candidate("ETH", "2026-09-01"), candidate("BTC", "2026-08-30"), candidate("SOL", "2026-09-02")];
  const priority = new Set(["BTC", "ETH"]);
  check(
    "priority symbols still rank stalest-first among themselves; unheld SOL sinks to the end",
    sortSymbols(candidates, priority).join(",") === "BTC,ETH,SOL",
    sortSymbols(candidates, priority).join(","),
  );
}

// --- 3. No priority symbols at all: falls back to the original stalest-first behaviour --
{
  const candidates = [candidate("AAA", "2026-09-02", 5), candidate("BBB", "2026-08-30", 1), candidate("CCC", "", 2)];
  check(
    "empty priority set: never-ingested first, then stalest-first (unchanged behaviour)",
    sortSymbols(candidates, new Set()).join(",") === "CCC,BBB,AAA",
    sortSymbols(candidates, new Set()).join(","),
  );
}

// --- 4. A never-ingested coin that's also held still wins the priority tier ------
{
  const candidates = [candidate("BTC", "2026-08-30"), candidate("NEWCOIN", "")];
  const priority = new Set(["NEWCOIN"]);
  check(
    "held-but-never-ingested still outranks a stale unheld coin",
    sortSymbols(candidates, priority)[0] === "NEWCOIN",
    sortSymbols(candidates, priority).join(","),
  );
}

// --- 5. Market-cap rank is only the final tiebreak, within one priority tier -----
{
  const candidates = [candidate("LOWRANK", "2026-09-01", 900), candidate("HIGHRANK", "2026-09-01", 1)];
  check(
    "equal staleness: lower (better) market-cap rank wins",
    sortSymbols(candidates, new Set()).join(",") === "HIGHRANK,LOWRANK",
    sortSymbols(candidates, new Set()).join(","),
  );
}

console.log(`\n${pass}/${pass + fail} history-refresh-priority cases passed`);
process.exit(fail === 0 ? 0 : 1);
