// Regression test for isStaleClose (src/lib/market-data/current-price.ts) -
// the Holdings-table stopgap from the 2026-09-04 walkthrough's finding #1.
//
// Root cause recap: getLatestCloses() already attempts a live quote before
// falling back to the last stored daily close, but the fallback was
// presented with no signal that it might be old - live-confirmed BTC's last
// bar was 5 days stale (2026-08-30 vs the equities' 2026-09-03) while the
// live-quote attempt for the SAME symbol, when it succeeds, is what
// Ticker/Calculators show. isStaleClose is the threshold that now flags a
// fallen-back-to close as stale in the Holdings table, asymmetric by asset
// type: crypto trades every calendar day, equities/ETFs do not.
//
// Run: npx tsx --conditions=react-server scripts/tests/holdings-stale-price.ts

import { isStaleClose, STALE_AFTER_HOURS } from "../../src/lib/market-data/current-price";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "pass" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
  ok ? pass++ : fail++;
}

const NOW = new Date("2026-09-04T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 60 * 60 * 1000).toISOString().slice(0, 10);

// --- 1. No date at all: never stale (nothing to compare) ---------------------
check("no asOf: not stale", isStaleClose("crypto", null, NOW) === false);

// --- 2. Crypto: the actual BTC case - 5 days (120h) old is stale --------------
{
  const btcAsOf = hoursAgo(5 * 24); // "2026-08-30"-shaped gap
  check(
    "crypto, 5 days stale: flagged (the live BTC bug)",
    isStaleClose("crypto", btcAsOf, NOW) === true,
    btcAsOf,
  );
}

// --- 3. Crypto: yesterday's close is fine, not stale --------------------------
check("crypto, ~18h old: not stale", isStaleClose("crypto", hoursAgo(18), NOW) === false);

// --- 4. Crypto: right at the threshold boundary -------------------------------
check(
  "crypto, just under threshold: not stale",
  isStaleClose("crypto", hoursAgo(STALE_AFTER_HOURS.crypto - 1), NOW) === false,
);
check(
  "crypto, just over threshold: stale",
  isStaleClose("crypto", hoursAgo(STALE_AFTER_HOURS.crypto + 1), NOW) === true,
);

// --- 5. Equity: a normal Friday-to-Monday gap (60h) must NOT be flagged -------
// isStaleClose has no market calendar - it only guards against a gap wide
// enough that no reasonable weekend/holiday explains it.
check("equity, 60h (long weekend): not stale", isStaleClose("equity", hoursAgo(60), NOW) === false);

// --- 6. Equity: a genuine multi-day ingestion gap IS flagged ------------------
check(
  "equity, 5 days: stale (real gap, not a weekend)",
  isStaleClose("equity", hoursAgo(5 * 24), NOW) === true,
);

// --- 7. Unknown/undefined asset type falls back to the wider (equity-like) bound --
check(
  "unknown asset type, 60h: treated like 'other', not stale",
  isStaleClose(undefined, hoursAgo(60), NOW) === false,
);

console.log(`\n${pass}/${pass + fail} holdings-stale-price cases passed`);
process.exit(fail === 0 ? 0 : 1);
