// Regression test for the 2026-09-05 UX review's item 1: "Currency setting
// isn't actually applied everywhere." The Ticker page and Alerts (and
// Billing's "$0" free-plan line) formatted money with a hardcoded
// `currency: "USD"` instead of routing through the shared DisplayPrefs
// helpers (lib/display-prefs.ts) that Markets/Screener/Portfolio/Comparison/
// Base Camp already use - so the same underlying figure showed a different
// currency symbol depending which page you were on.
//
// This checks every formatter this sweep touched or added produces the SAME
// symbol for the SAME DisplayPrefs, under both a EUR and a USD account - not
// just "does it show a euro sign somewhere" (which the old, unfixed, always-
// USD code would still coincidentally pass under a USD account).
//
// Run: npx tsx --conditions=react-server scripts/tests/currency-formatting.ts

import { formatMoney, currencySymbol, type DisplayPrefs } from "@/lib/display-prefs";
import { formatMarketCap } from "@/lib/screener";
import { describeCondition } from "@/lib/alerts";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "pass" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
  ok ? pass++ : fail++;
}

const EUR: DisplayPrefs = {
  currency: "EUR",
  effectiveCurrency: "EUR",
  fxRate: 0.92,
  fxAsOf: "2026-09-05",
  fxUnavailable: false,
  metricStyle: "percent",
  compactMode: false,
  extendedHours: false,
  defaultChartView: "1D",
};
const USD: DisplayPrefs = { ...EUR, currency: "USD", effectiveCurrency: "USD", fxRate: 1 };

const AMOUNT = 319.97; // the AAPL price the audit quoted as showing "$319.97" under EUR

// --- 1. currencySymbol: the exact helper alert-form.tsx's "Price ($)" label needs ---
check("currencySymbol: EUR account gets €", currencySymbol(EUR) === "€", currencySymbol(EUR));
check("currencySymbol: USD account gets $", currencySymbol(USD) === "$", currencySymbol(USD));

// --- 2. formatMarketCap (Markets/Screener/Comparison/Ticker's market cap cell) ------
{
  const eur = formatMarketCap(1_500_000_000, EUR);
  const usd = formatMarketCap(1_500_000_000, USD);
  check("formatMarketCap: EUR account shows €, not $", eur.includes("€") && !eur.includes("$"), eur);
  check("formatMarketCap: USD account shows $, not €", usd.includes("$") && !usd.includes("€"), usd);
}

// --- 3. describeCondition (Alerts' active-alert condition line) --------------------
{
  const condition = { comparator: "above", value: 221 };
  const eur = describeCondition("price", condition, EUR);
  const usd = describeCondition("price", condition, USD);
  check("describeCondition: EUR account shows €, not $ (the reported Alerts bug)", eur.includes("€") && !eur.includes("$"), eur);
  check("describeCondition: USD account still shows $", usd.includes("$"), usd);
  check(
    "describeCondition: with no prefs at all, still falls back to a plain value (no crash)",
    describeCondition("price", condition).includes("221"),
  );
}

// --- 4. The actual cross-page consistency check the task asked for -----------------
// Same raw figure, same prefs, must produce the same symbol from every
// formatter - this is what "not just hiding the bug by coincidence" means:
// re-run under EUR AND under USD, and the symbol must track the prefs both
// times, not just happen to read "$" because everything defaults to USD.
for (const prefs of [EUR, USD]) {
  const symbol = currencySymbol(prefs);
  const fromFormatMoney = formatMoney(AMOUNT, prefs);
  const fromMarketCap = formatMarketCap(AMOUNT, prefs);
  const fromCondition = describeCondition("price", { comparator: "above", value: AMOUNT }, prefs);
  check(
    `[${prefs.effectiveCurrency}] formatMoney and currencySymbol agree`,
    fromFormatMoney.includes(symbol),
    `${symbol} / ${fromFormatMoney}`,
  );
  check(
    `[${prefs.effectiveCurrency}] formatMarketCap and currencySymbol agree`,
    fromMarketCap.includes(symbol),
    `${symbol} / ${fromMarketCap}`,
  );
  check(
    `[${prefs.effectiveCurrency}] describeCondition and currencySymbol agree`,
    fromCondition.includes(symbol),
    `${symbol} / ${fromCondition}`,
  );
}

console.log(`\n${pass}/${pass + fail} currency-formatting cases passed`);
process.exit(fail === 0 ? 0 : 1);
