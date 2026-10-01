// Native currency (feat/native-currency): anything that describes an asset is
// shown in the asset's own currency and never converted; only the reader's own
// money converts to their display currency.
//
// Pins: both formatter pairs (sub-unit coin prices, compact figures, an unknown
// currency), the currency resolver and its server lookup, the screener's
// money filters, price-alert thresholds, and a guard that no asset surface
// imports the converting formatter.
//
// Run: npx tsx --conditions=react-server scripts/tests/native-currency.ts

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  DEFAULT_DISPLAY_PREFS,
  formatAssetChange,
  formatAssetMoney,
  formatCompactAssetMoney,
  formatCompactUserMoney,
  formatUserMoney,
  pricesInLabel,
  userEquivalent,
  type DisplayPrefs,
} from "@/lib/display-prefs";
import { normalizeCurrencyCode, resolveAssetCurrency } from "@/lib/asset-currency";
import { getAssetCurrency, getAssetCurrencies } from "@/lib/market-data/asset-currency";
import { applyScreenerFilters, EMPTY_FILTERS, type ScreenerRow } from "@/lib/screener";
import { alertCurrency, buildAlertCondition, describeCondition, evaluateAlert, type Alert } from "@/lib/alerts";
import { currencyNoteText } from "@/components/layout/currency-note";
import { writeReport, type SuiteResult, type TestCase } from "./report";
import { renderComponentText } from "./render-helper";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(DIR, "..", "..");

const EUR: DisplayPrefs = { ...DEFAULT_DISPLAY_PREFS, currency: "EUR", effectiveCurrency: "EUR", fxRate: 0.86, fxAsOf: "2026-09-26", fxSource: "ECB" };
const USD = DEFAULT_DISPLAY_PREFS;

/** A Supabase-shaped fake: .from(table).select().in(col, values) over in-memory rows. */
function fakeClient(tables: Record<string, Record<string, unknown>[]>) {
  return {
    from(table: string) {
      return {
        select() {
          return {
            in(col: string, values: string[]) {
              return Promise.resolve({ data: (tables[table] ?? []).filter((r) => values.includes(r[col] as string)), error: null });
            },
          };
        },
      };
    },
  } as never;
}

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}

export async function runNativeCurrencySuite(): Promise<SuiteResult> {
  const cases: TestCase[] = [];
  const check = (name: string, ok: boolean, detail: string) => cases.push({ name, status: ok ? "pass" : "fail", detail });

  // ---- formatters --------------------------------------------------------
  check("asset money is never converted: NVDA $225.07 for a EUR reader", formatAssetMoney(225.07, "USD") === "$225.07", formatAssetMoney(225.07, "USD"));
  check("user money converts: $225.07 of portfolio is €193.56 at 0.86", formatUserMoney(225.07, EUR) === "€193.56", formatUserMoney(225.07, EUR));
  check("a USD reader's money is unchanged", formatUserMoney(225.07, USD) === "$225.07", formatUserMoney(225.07, USD));
  check("asset money in another currency uses its own code", formatAssetMoney(31.2, "CAD") === "CA$31.20", formatAssetMoney(31.2, "CAD"));
  check("a sub-cent coin keeps significant digits", formatAssetMoney(0.00000123, "USD") === "$0.000001", formatAssetMoney(0.00000123, "USD"));
  check("a coin under a dollar keeps three significant figures", formatAssetMoney(0.0456, "USD") === "$0.0456", formatAssetMoney(0.0456, "USD"));
  check("compact asset money: $3.4B", formatCompactAssetMoney(3_400_000_000, "USD") === "$3.4B", formatCompactAssetMoney(3_400_000_000, "USD"));
  check("compact asset money below the threshold keeps cents", formatCompactAssetMoney(1234.5, "USD") === "$1,234.50", formatCompactAssetMoney(1234.5, "USD"));
  check("compact user money converts too", formatCompactUserMoney(4_000_000, EUR) === "€3.44M", formatCompactUserMoney(4_000_000, EUR));
  const unknown = formatAssetMoney(1.0847, null);
  check("an unknown currency says so instead of guessing a symbol", unknown === "1.08 (currency unknown)" && !/[$€£]/.test(unknown), unknown);
  check("compact unknown currency says so too", formatCompactAssetMoney(5e9, null) === "5B (currency unknown)", formatCompactAssetMoney(5e9, null));
  check("missing figures stay a dash", formatAssetMoney(null, "USD") === "-" && formatAssetMoney(Number.NaN, "USD") === "-", "dash");
  const absEur = { ...EUR, metricStyle: "absolute" as const };
  check("an asset's money change is in its own currency for a EUR reader", formatAssetChange(4.5, 2.1, "USD", absEur) === "+$4.50", formatAssetChange(4.5, 2.1, "USD", absEur));
  check("the ≈ hint converts a USD price for a EUR reader", userEquivalent(225.07, "USD", EUR) === "≈ €193.56", String(userEquivalent(225.07, "USD", EUR)));
  check("no ≈ hint for a USD reader", userEquivalent(225.07, "USD", USD) === null, String(userEquivalent(225.07, "USD", USD)));
  check("no ≈ hint for an asset the ECB USD rate can't convert", userEquivalent(31.2, "CAD", EUR) === null, String(userEquivalent(31.2, "CAD", EUR)));
  check("the tag names the code: Prices in USD", pricesInLabel(["USD", "USD"]) === "Prices in USD", pricesInLabel(["USD", "USD"]));
  check("a mixed list says so", pricesInLabel(["USD", "CAD"]) === "Prices in each asset's own currency", pricesInLabel(["USD", "CAD"]));
  const note = currencyNoteText(EUR) ?? "";
  check("the page note explains the split, dated", note === "Share and coin prices are in their own currency. Your portfolio is shown in EUR (ECB rate, 26 Sep 2026).", note);
  check("a USD reader gets no note", currencyNoteText(USD) === null, String(currencyNoteText(USD)));

  // ---- resolver ----------------------------------------------------------
  check("a US equity is USD", resolveAssetCurrency({ symbol: "NVDA", assetType: "equity" }) === "USD", "NVDA");
  check("a US share class with a dot is still USD", resolveAssetCurrency({ symbol: "BRK.B", assetType: "equity" }) === "USD", "BRK.B");
  check("an ETF is USD", resolveAssetCurrency({ symbol: "SPY", assetType: "etf" }) === "USD", "SPY");
  check("a coin is USD (CoinGecko vs_currency=usd)", resolveAssetCurrency({ symbol: "BTC", assetType: "crypto" }) === "USD", "BTC");
  check("a foreign listing is NOT assumed to be USD", resolveAssetCurrency({ symbol: "SAP.DE", assetType: "equity" }) === null, "SAP.DE");
  check("a stated profile currency wins", resolveAssetCurrency({ symbol: "SAP.DE", assetType: "equity", profileCurrency: "EUR" }) === "EUR", "EUR");
  check("pence (GBp / GBX) is not read as pounds", normalizeCurrencyCode("GBp") === null && normalizeCurrencyCode("GBX") === null, "minor units");
  check("a forex pair or an index is currency unknown", resolveAssetCurrency({ symbol: "EURUSD", assetType: "forex" }) === null && resolveAssetCurrency({ symbol: "SPX", assetType: "index" }) === null, "unknown");
  check("an unknown asset type is currency unknown", resolveAssetCurrency({ symbol: "ZZZ", assetType: null }) === null, "null");

  const client = fakeClient({
    symbol_directory: [
      { symbol: "NVDA", asset_type: "equity" },
      { symbol: "BTC", asset_type: "crypto" },
      { symbol: "VOD.L", asset_type: "equity" },
      { symbol: "SHOP.TO", asset_type: "equity" },
    ],
    symbol_profiles: [{ symbol: "SHOP.TO", currency: "CAD" }],
  });
  check("getAssetCurrency: NVDA from the directory is USD", (await getAssetCurrency("NVDA", { client })) === "USD", "NVDA");
  check("getAssetCurrency: a profile's currency is used", (await getAssetCurrency("SHOP.TO", { client })) === "CAD", "SHOP.TO");
  check("getAssetCurrency: a foreign listing without a profile is unknown", (await getAssetCurrency("VOD.L", { client })) === null, "VOD.L");
  check("getAssetCurrency: a symbol Cairn doesn't track is unknown", (await getAssetCurrency("NOPE", { client })) === null, "NOPE");
  const many = await getAssetCurrencies(["NVDA", "BTC", "SHOP.TO"], { client });
  check("getAssetCurrencies resolves a batch", many.get("NVDA") === "USD" && many.get("BTC") === "USD" && many.get("SHOP.TO") === "CAD", JSON.stringify([...many]));

  // ---- screener money filters compare in the asset's currency ------------
  const row = (symbol: string, price: number, currency: string | null): ScreenerRow => ({
    symbol, assetType: "equity", name: null, price, changePct: 1, volume: 1, asOf: null, trend: [], marketCap: price * 1e9, pe: null, dividendYield: null, week52High: null, week52Low: null, currency,
  });
  const rows = [row("NVDA", 225.07, "USD"), row("SHOP.TO", 150, "CAD"), row("FX", 1.08, null)];
  const over200 = applyScreenerFilters(rows, { ...EMPTY_FILTERS, minPrice: 200 }).map((r) => r.symbol);
  check("a USD price filter matches the stored USD price, unconverted", over200.join() === "NVDA", over200.join());
  const over100 = applyScreenerFilters(rows, { ...EMPTY_FILTERS, minPrice: 100 }).map((r) => r.symbol);
  check("a USD price filter never compares a CAD price as dollars", !over100.includes("SHOP.TO"), over100.join());
  check("with no money filter every row is listed", applyScreenerFilters(rows, EMPTY_FILTERS).length === 3, "3 rows");

  // ---- alert thresholds --------------------------------------------------
  const form = (value: string, comparator = "above") => ({ get: (k: string) => (k === "value" ? value : k === "comparator" ? comparator : null) });
  const c = buildAlertCondition("price", form("200"), "USD");
  check("a price threshold is stored as typed, in the asset's currency", JSON.stringify(c) === JSON.stringify({ comparator: "above", value: 200, currency: "USD" }), JSON.stringify(c));
  check("a price alert on an asset of unknown currency is refused", typeof buildAlertCondition("price", form("200"), null) === "string", String(buildAlertCondition("price", form("200"), null)));
  check("a % alert carries no currency", JSON.stringify(buildAlertCondition("pct_change", form("5"), "USD")) === JSON.stringify({ comparator: "above", value: 5 }), "pct");
  check("the alert list shows the asset's currency", describeCondition("price", { comparator: "above", value: 150, currency: "CAD" }) === "Price above CA$150.00", describeCondition("price", { comparator: "above", value: 150, currency: "CAD" }));
  check("a legacy alert (no stored currency) reads as USD", alertCurrency({ value: 221 }) === "USD", alertCurrency({ value: 221 }));
  const fired = evaluateAlert({
    alert: { id: "a", alert_type: "price", scope_value: "NVDA", condition: { comparator: "above", value: 200, currency: "USD" } } as unknown as Alert,
    series: { closes: [225.07, 220], volumes: [1, 1] },
  });
  check("the alert message is in the asset's currency", fired.message === "NVDA is above $200.00 (last close $225.07).", String(fired.message));

  // ---- guard: no asset surface imports the converting formatter ----------
  const assetDirs = ["ticker", "markets", "screener", "comparison", "watchlists"].map((d) => path.join(ROOT, "src", "components", d));
  const offenders = assetDirs
    .flatMap((d) => walk(d))
    .filter((f) => /\.tsx?$/.test(f))
    .filter((f) => /\bformat(?:Compact)?(?:Signed)?User(?:Money|Change|SecondaryChange)\b/.test(fs.readFileSync(f, "utf8")))
    .map((f) => path.relative(ROOT, f));
  // The ticker page legitimately shows the reader's OWN position (value, gain)
  // in their currency; that is the one place an asset folder may convert.
  const allowed = new Set([path.join("src", "components", "ticker", "ticker-workspace.tsx")]);
  const bad = offenders.filter((f) => !allowed.has(f));
  check("no asset surface (ticker/markets/screener/comparison/watchlists) imports formatUserMoney", bad.length === 0, bad.join(", ") || `checked ${assetDirs.length} folders`);
  const ws = fs.readFileSync(path.join(ROOT, "src", "components", "ticker", "ticker-workspace.tsx"), "utf8");
  check("the ticker page converts only the reader's own position", (ws.match(/userMoney\(/g) ?? []).length === 3 && /const currency = \(n: number \| null\) => formatAssetMoney\(n, data\.currency\)/.test(ws), "userMoney x3: position chip, value, gain");
  check("no plain formatMoney alias is left behind", !/export function formatMoney\b/.test(fs.readFileSync(path.join(ROOT, "src", "lib", "display-prefs.ts"), "utf8")), "display-prefs.ts");

  // ---- what a EUR reader and a USD reader actually see (real components) ----
  const H = "scripts/tests/native-currency-render.tsx";
  for (const name of ["Markets", "Compare"]) {
    const eur = renderComponentText(H, name, { currency: "EUR" });
    const usd = renderComponentText(H, name, { currency: "USD" });
    check(`${name}: a EUR reader sees NVDA at $225.07, no euro figure`, eur.includes("$225.07") && !eur.includes("€"), eur.slice(0, 160));
    check(`${name}: the list names its currency once - Prices in USD`, eur.includes("Prices in USD"), eur.slice(-120));
    check(`${name}: a USD reader sees exactly the same`, eur === usd, eur === usd ? "identical" : usd.slice(0, 160));
  }
  const rendered = renderComponentText(H, "Note", { currency: "EUR" });
  check("the page note renders the split for a EUR reader", rendered.startsWith("Share and coin prices are in their own currency."), rendered);
  const holdings = fs.readFileSync(path.join(ROOT, "src", "components", "portfolio", "holdings-table.tsx"), "utf8");
  check(
    "a holding row: price in the asset currency, value in the reader's",
    holdings.includes("formatCompactAssetMoney(m.currentPrice") && holdings.includes("formatCompactUserMoney(n, prefs)") && holdings.split("{fmtPrice(m)}").length === 3,
    "desktop + mobile price cells",
  );

  return { suiteName: "Native currency (asset figures unconverted, the reader's money converted)", gating: true, cases };
}

async function main() {
  const suite = await runNativeCurrencySuite();
  for (const c of suite.cases) console.log(`${c.status.toUpperCase()} ${c.name} - ${c.detail}`);
  console.log(`Report written to ${writeReport([suite])}`);
  process.exit(suite.cases.every((c) => c.status === "pass") ? 0 : 1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
