// Audit 2026-09-04, finding #10: getIntradayPortfolioSeries fetched each
// holding's intraday series one at a time in a loop - up to 8 serial provider
// round-trips (plus a serial maybeSingle per symbol for the asset type) on
// every intraday chart load.
//
// The orchestration can't be unit-tested without a live provider + DB, so this
// is a structural lock: the per-holding provider fetch must be issued through
// Promise.all, not awaited inside a for-loop, and the asset-type lookup must be
// one batched query.
//
// Run: npx tsx --conditions=react-server scripts/tests/intraday-parallel.ts

import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const src = readFileSync(join(ROOT, "src/lib/actions/intraday.ts"), "utf8");

// Just the portfolio function body.
const start = src.indexOf("export async function getIntradayPortfolioSeries");
const body = src.slice(start);

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "pass" : "FAIL"}  ${name}${!ok && detail ? ` - ${detail}` : ""}`);
  ok ? pass++ : fail++;
}

check(
  "the per-holding intraday fetch is issued via Promise.all",
  /Promise\.all\(\s*symbols\.map\(/.test(body),
  "expected `Promise.all(symbols.map(... fetchIntradaySeries ...))`",
);

check(
  "fetchIntradaySeries is not awaited inside a for-loop over symbols",
  !/for\s*\(\s*const\s+\w+\s+of\s+symbols\s*\)[\s\S]{0,200}?await\s+fetchIntradaySeries/.test(body),
  "still a serial per-symbol await",
);

check(
  "asset types come from one batched .in() query, not a serial per-symbol lookup",
  /symbol_directory[\s\S]{0,120}?\.in\(\s*["']symbol["']/.test(body) &&
    !/for\s*\(\s*const\s+\w+\s+of\s+symbols\s*\)[\s\S]{0,120}?await\s+assetTypeOf/.test(body),
  "asset type still resolved one symbol at a time",
);

check(
  "the independent pre-fetch reads run concurrently",
  /Promise\.all\(\[[\s\S]{0,400}?recent_prices[\s\S]{0,200}?getDisplayPrefs\(\)/.test(body),
  "recent_prices / display-prefs / asset-types still sequential",
);

// The per-symbol failure fallback must survive the refactor.
check(
  "a single symbol's failed fetch still falls back (if (!bars) continue)",
  /if\s*\(\s*!bars\s*\)\s*continue/.test(body),
  "lost the per-symbol degrade path",
);

console.log(`\n${pass}/${pass + fail} intraday-parallel cases passed`);
process.exit(fail === 0 ? 0 : 1);
