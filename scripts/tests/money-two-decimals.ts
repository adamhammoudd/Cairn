// Audit 2026-10-02 item 4.5: AMZN's loss showed "-EUR 0.164" while every other
// amount had two decimals. The cause: the reader's own money went through the
// sub-unit precision rule built for asset PRICES (so a coin under a cent does
// not read "0.00"). User money is now always at the currency's own precision.
//
// Locale-agnostic: it compares the digits, so a machine whose default locale
// writes "0,16 EUR" passes the same as one that writes "EUR0.16".
//
// Run: npx tsx --conditions=react-server scripts/tests/money-two-decimals.ts

import {
  DEFAULT_DISPLAY_PREFS,
  formatAssetMoney,
  formatCompactAssetMoney,
  formatSignedDisplayMoney,
  formatSignedUserMoney,
  formatUserMoney,
  type DisplayPrefs,
} from "../../src/lib/display-prefs";
import { makeSuite, runIfMain } from "./mini";
import type { SuiteResult } from "./report";

const EUR: DisplayPrefs = { ...DEFAULT_DISPLAY_PREFS, effectiveCurrency: "EUR", fxRate: 1 };
const USD: DisplayPrefs = { ...DEFAULT_DISPLAY_PREFS, effectiveCurrency: "USD", fxRate: 1 };
const digits = (s: string) => s.replace(/\D/g, "");
const decimals = (s: string) => (/[.,](\d+)\D*$/.exec(s.trim())?.[1] ?? "").length;

export function runMoneyTwoDecimalsSuite(): SuiteResult {
  const { check, result } = makeSuite("Money figures: two decimals for the reader's own money");

  const cases: [number, string][] = [
    [-0.164, "016"],
    [-0.1, "010"],
    [0.004, "000"],
    [1234.5, "123450"],
  ];
  for (const [n, want] of cases) {
    for (const [label, prefs] of [["EUR", EUR], ["USD", USD]] as const) {
      const s = formatUserMoney(n, prefs);
      check(`${label} ${n} -> "${s}" has exactly two decimals`, decimals(s) === 2 && digits(s) === want, `digits ${digits(s)}`);
    }
  }
  check("the reported loss keeps its sign", /[-−]/.test(formatUserMoney(-0.164, EUR)) && !/[-−]/.test(formatUserMoney(0.164, EUR)), formatUserMoney(-0.164, EUR));
  check("a signed gain/loss column: -0.164 and +0.1 both two decimals", decimals(formatSignedUserMoney(-0.164, EUR)) === 2 && decimals(formatSignedUserMoney(0.1, EUR)) === 2 && formatSignedUserMoney(0.1, EUR).startsWith("+"));
  check("display-currency parts of a gain are two decimals too", decimals(formatSignedDisplayMoney(-0.164, EUR)) === 2 && decimals(formatSignedDisplayMoney(0.004, EUR)) === 2);
  check("a figure converted by the rate is still two decimals (0.164 USD at 0.9)", decimals(formatUserMoney(0.164, { ...EUR, fxRate: 0.9 })) === 2);
  check("a currency with no minor unit stays whole (JPY)", !/[.,]\d{1,2}\D*$/.test(formatUserMoney(1234.5, { ...EUR, effectiveCurrency: "JPY", fxRate: 150 })) && /185/.test(formatUserMoney(1234.5, { ...EUR, effectiveCurrency: "JPY", fxRate: 150 })), formatUserMoney(1234.5, { ...EUR, effectiveCurrency: "JPY", fxRate: 150 }));

  // The exception that stays, on purpose: what an ASSET trades at.
  check("an asset price under a cent still shows a non-zero figure (not 0.00)", /[1-9]/.test(digits(formatAssetMoney(0.0000097, "USD"))) && decimals(formatAssetMoney(0.0000097, "USD")) > 2, formatAssetMoney(0.0000097, "USD"));
  check("an asset price at or above 1 is untouched", decimals(formatAssetMoney(178.4, "USD")) === 2);
  check("compact asset money is $3.4B on every ICU version (explicit minimum fraction digits)", formatCompactAssetMoney(3_400_000_000, "USD", 1_000_000) === "$3.4B", formatCompactAssetMoney(3_400_000_000, "USD"));
  return result();
}

void runIfMain(import.meta.url, runMoneyTwoDecimalsSuite);
