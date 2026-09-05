// Item 6 of the 2026-09-05 fix sweep: "BTC portfolio value doesn't fully
// reconcile with its displayed price" - roughly an 8% gap when checked by
// hand (quantity x displayed price != displayed value).
//
// The underlying math was never wrong: computeHoldingMetrics computes
// `value = currentPrice * h.quantity` from the full-precision quantity in
// every case. The gap was in what the Quantity column PRINTED: a 0.000544
// BTC holding rounded to 4 decimal places (fine for a share count) rendered
// as "0.0005" - if a reader multiplies that rounded number by the displayed
// price, they get a figure ~8% below the row's own (correctly computed)
// value, purely from the display truncation. Live numbers checked below.
//
// Run: npx tsx --conditions=react-server scripts/tests/btc-value-reconciliation.ts

import { formatQuantity } from "@/lib/portfolio";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "pass" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
  ok ? pass++ : fail++;
}

// Adam's real BTC holding, live-checked 2026-09-05: quantity 0.000544 BTC,
// live quote $79,724.77 (Twelve Data, BTC/USD).
const QUANTITY = 0.000544;
const LIVE_PRICE = 79724.77;
const trueValue = QUANTITY * LIVE_PRICE;

// --- 1. Reproduce the exact reported gap with the OLD 4-decimal rounding ------
{
  const oldDisplayed = Number(QUANTITY.toFixed(4)); // what maximumFractionDigits: 4 rendered
  const manualCheckOld = oldDisplayed * LIVE_PRICE;
  const gapPct = ((trueValue - manualCheckOld) / trueValue) * 100;
  check(
    "the old 4-decimal rounding reproduces the reported ~8% gap",
    gapPct > 7 && gapPct < 9,
    `old displayed qty ${oldDisplayed}, manual check $${manualCheckOld.toFixed(2)} vs true value $${trueValue.toFixed(2)} (${gapPct.toFixed(2)}% gap)`,
  );
}

// --- 2. formatQuantity (the fix): a fractional holding keeps full precision ---
{
  const displayed = formatQuantity(QUANTITY);
  check("formatQuantity renders the real quantity, not a rounded one", displayed === "0.000544", displayed);
  const manualCheckNew = Number(displayed) * LIVE_PRICE;
  const gapPct = Math.abs((trueValue - manualCheckNew) / trueValue) * 100;
  check(
    "manual check against the FIXED display now reconciles (< 0.01% gap)",
    gapPct < 0.01,
    `manual check $${manualCheckNew.toFixed(2)} vs true value $${trueValue.toFixed(2)} (${gapPct.toFixed(4)}% gap)`,
  );
}

// --- 3. Whole-share holdings (equities) are unaffected - still 4 decimal places max --
{
  check("a whole-share quantity (10) is untouched", formatQuantity(10) === "10", formatQuantity(10));
  check("an ordinary fractional share count (2.5) still shows plainly", formatQuantity(2.5) === "2.5", formatQuantity(2.5));
  check(
    "a share count with >4 real decimals still caps at 4 (unaffected by the crypto case)",
    formatQuantity(12.123456) === "12.1235",
    formatQuantity(12.123456),
  );
}

// --- 4. A very small fractional quantity still doesn't show spurious trailing zeros --
check("a round fractional quantity (0.5) doesn't grow trailing zeros", formatQuantity(0.5) === "0.5", formatQuantity(0.5));

console.log(`\n${pass}/${pass + fail} btc-value-reconciliation cases passed`);
process.exitCode = fail === 0 ? 0 : 1;
