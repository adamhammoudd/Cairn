// Where a euro reader's gain comes from (fix/cost-basis-fx).
//
// The unrealised gain in the display currency is value today minus the cost at
// the rate on each purchase date. It has two parts, and a reader holding dollar
// assets in euros can see only the sum unless the page says which is which:
//
//   From the price          the assets' own move, converted at today's rate
//   From the exchange rate  what the dollar-to-euro move since each purchase added
//
// They add up to the total, to the cent: the exchange-rate part is the rounded
// total minus the rounded price part, so what is printed always sums.
//
// Facts only - no "good", no "bad", no advice. Hidden when nothing was
// converted (a USD reader), because a split with one empty side is noise.

import { formatSignedDisplayMoney, type DisplayPrefs } from "@/lib/display-prefs";
import type { PortfolioTotals } from "@/lib/portfolio";

export interface GainSplit {
  /** Display-currency amounts, rounded to the currency's minor unit. */
  price: number;
  exchange: number;
  total: number;
  priceLabel: string;
  exchangeLabel: string;
  /** Set when some costs had to use today's rate; says so rather than guessing silently. */
  note: string | null;
}

function minorDigits(currency: string): number {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

export function gainSplit(
  totals: Pick<PortfolioTotals, "totalGain" | "totalPriceGain" | "totalFxGain" | "costConverted" | "costAtTodayRateCount">,
  prefs: Pick<DisplayPrefs, "effectiveCurrency" | "fxRate" | "fxSource">,
  positions?: number,
): GainSplit | null {
  if (prefs.effectiveCurrency === "USD" || prefs.fxSource === null || !totals.costConverted) return null;
  const digits = minorDigits(prefs.effectiveCurrency);
  const round = (n: number) => Number(n.toFixed(digits));
  const total = round(totals.totalGain * prefs.fxRate);
  const price = round(totals.totalPriceGain * prefs.fxRate);
  const exchange = round(total - price);
  const n = totals.costAtTodayRateCount;
  const note =
    n > 0
      ? `${n === positions ? "Cost" : `Cost for ${n} ${n === 1 ? "holding" : "holdings"}`} converted at today's rate (no exchange rate held for the purchase date).`
      : null;
  return {
    price,
    exchange,
    total,
    priceLabel: `From the price: ${formatSignedDisplayMoney(price, prefs)}`,
    exchangeLabel: `From the exchange rate: ${formatSignedDisplayMoney(exchange, prefs)}`,
    note,
  };
}
