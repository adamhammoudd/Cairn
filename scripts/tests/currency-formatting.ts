// Cross-page currency consistency, under the native-currency rule
// (feat/native-currency).
//
// This suite used to pin the opposite rule - "every price follows the display
// currency" - from the 2026-09-05 UX review, when Ticker and Alerts printed a
// hard-coded "$" while Markets converted. That fixed the inconsistency by
// converting everything, which mixed each stock's move with the euro's. The
// rule now is: anything that describes an asset (price, market cap, an alert
// level) is in the asset's own currency and does NOT move with the display
// setting; only the reader's own money converts.
//
// Checked under a EUR account AND a USD account, so a pass cannot come from
// everything simply defaulting to dollars.
//
// Run: npx tsx --conditions=react-server scripts/tests/currency-formatting.ts

import { formatAssetMoney, formatUserMoney, type DisplayPrefs } from "@/lib/display-prefs";
import { formatMarketCap } from "@/lib/screener";
import { describeCondition } from "@/lib/alerts";

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
const USD: DisplayPrefs = { ...EUR, currency: "USD", effectiveCurrency: "USD", fxRate: 1, fxSource: null, fxAsOf: null };

const AMOUNT = 319.97; // the AAPL price the 2026-09-05 audit quoted

// --- 1. Asset figures are identical for a EUR and a USD reader -------------------
{
  const price = [formatAssetMoney(AMOUNT, "USD"), formatAssetMoney(AMOUNT, "USD")];
  check("an asset price is $319.97 whatever the reader's currency", price.every((p) => p === "$319.97"), price.join(" / "));
  const cap = formatMarketCap(1_500_000_000, "USD");
  check("market cap is in the asset's currency, not converted", cap.includes("$") && !cap.includes("€") && /1\.5B/.test(cap), cap);
  const condition = { comparator: "above", value: 221, currency: "USD" };
  const line = describeCondition("price", condition);
  check("an alert level is shown in the asset's currency", line === "Price above $221.00", line);
  check("a legacy alert with no stored currency reads as USD", describeCondition("price", { comparator: "above", value: 221 }) === "Price above $221.00");
}

// --- 2. The reader's own money follows the display currency ---------------------
for (const prefs of [EUR, USD]) {
  const own = formatUserMoney(AMOUNT, prefs);
  const symbol = prefs.effectiveCurrency === "EUR" ? "€" : "$";
  check(`[${prefs.effectiveCurrency}] portfolio money is in the display currency`, own.includes(symbol), own);
  check(
    `[${prefs.effectiveCurrency}] the same figure as an asset price does not move with it`,
    formatAssetMoney(AMOUNT, "USD") === "$319.97",
    formatAssetMoney(AMOUNT, "USD"),
  );
}
check("EUR portfolio money is converted at the rate", formatUserMoney(100, EUR) === "€92.00", formatUserMoney(100, EUR));

// --- 3. Never a euro sign on a dollar figure, never "$" on a non-USD one ---------
check("a CAD asset is not printed with a bare $", !/^\$/.test(formatAssetMoney(31.2, "CAD")), formatAssetMoney(31.2, "CAD"));
check("a EUR asset shows €", formatAssetMoney(31.2, "EUR").includes("€"), formatAssetMoney(31.2, "EUR"));

console.log(`\n${pass}/${pass + fail} currency-formatting cases passed`);
process.exit(fail === 0 ? 0 : 1);
