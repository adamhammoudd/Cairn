// Regression test for the "designed missing-data states" pass.
//
// The founder review flagged data cells that showed a bare "-" for absent data
// - market cap on a fund, volume on an index, a sparkline for a position added
// less than a window ago - sitting next to rows that DID show a figure, with
// no way to tell "not reported" from a real zero.
//
// The fix routes every absent figure through one explicit token ("n/a") that a
// formatted number can never collide with, so "$0" / "€0" stays distinct from
// "no data" in the same column. This locks that in.
//
// Run: npx tsx --conditions=react-server scripts/tests/missing-data-states.ts

import { formatMarketCap, formatVolume } from "@/lib/screener";
import type { DisplayPrefs } from "@/lib/display-prefs";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "pass" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
  if (ok) pass++;
  else fail++;
}

const EUR: DisplayPrefs = {
  currency: "EUR",
  effectiveCurrency: "EUR",
  fxRate: 0.92,
  fxAsOf: "2026-09-05",
  fxSource: "ECB",
  fxUnavailable: false,
  metricStyle: "percent",
  compactMode: false,
  extendedHours: false,
  defaultChartView: "1D",
};
const USD: DisplayPrefs = { ...EUR, currency: "USD", effectiveCurrency: "USD", fxRate: 1 };

// --- market cap: absent vs. a real zero -----------------------------------------
for (const prefs of [EUR, USD]) {
  const absent = formatMarketCap(null, prefs);
  const zero = formatMarketCap(0, prefs);
  check(`[${prefs.effectiveCurrency}] formatMarketCap(null) is the explicit token, not a dash`, absent === "n/a", absent);
  check(`[${prefs.effectiveCurrency}] formatMarketCap(0) is a formatted figure, not "n/a"`, zero !== "n/a" && /\d/.test(zero), zero);
  check(`[${prefs.effectiveCurrency}] absent and zero market cap are distinguishable`, absent !== zero, `${absent} vs ${zero}`);
}

// --- volume: absent vs. a real zero -------------------------------------------
{
  const absent = formatVolume(null);
  const zero = formatVolume(0);
  check("formatVolume(null) is the explicit token, not a dash", absent === "n/a", absent);
  check("formatVolume(0) is a number, not \"n/a\"", zero !== "n/a" && /\d/.test(zero), zero);
  check("absent and zero volume are distinguishable", absent !== zero, `${absent} vs ${zero}`);
}

// --- neither formatter emits a bare hyphen anymore ---------------------------
check("formatMarketCap(null) is not \"-\"", formatMarketCap(null, EUR) !== "-");
check("formatVolume(null) is not \"-\"", formatVolume(null) !== "-");

console.log(`\n${pass}/${pass + fail} missing-data-states cases passed`);
process.exit(fail === 0 ? 0 : 1);
