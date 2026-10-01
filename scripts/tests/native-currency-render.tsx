// Real components under a display-currency provider, for native-currency.ts
// (rendered by render-component.ts in a child process). Each export takes
// { currency: "EUR" | "USD" } plus fixed sample data, so the suite can compare
// what a EUR reader and a USD reader actually see.
import { DisplayPrefsProvider } from "@/components/display-prefs-provider";
import { DEFAULT_DISPLAY_PREFS, type DisplayPrefs } from "@/lib/display-prefs";
import { TickerList } from "@/components/markets/ticker-list";
import { ComparisonTable } from "@/components/comparison/comparison-table";
import { CurrencyNote } from "@/components/layout/currency-note";
import type { ScreenerRow } from "@/lib/screener";

const prefsFor = (c: string): DisplayPrefs =>
  c === "EUR"
    ? { ...DEFAULT_DISPLAY_PREFS, currency: "EUR", effectiveCurrency: "EUR", fxRate: 0.86, fxAsOf: "2026-09-26", fxSource: "ECB" }
    : DEFAULT_DISPLAY_PREFS;

const NVDA: ScreenerRow = {
  symbol: "NVDA", assetType: "equity", name: "NVIDIA", price: 225.07, changePct: 2.1, volume: 1e8, asOf: "2026-09-26",
  trend: [210, 225.07], marketCap: 5.5e12, pe: 50, dividendYield: 0.02, week52High: 230, week52Low: 120, currency: "USD",
};

export function Markets({ currency }: { currency: string }) {
  return (
    <DisplayPrefsProvider value={prefsFor(currency)}>
      <TickerList rows={[NVDA]} />
    </DisplayPrefsProvider>
  );
}

export function Compare({ currency }: { currency: string }) {
  return (
    <DisplayPrefsProvider value={prefsFor(currency)}>
      <ComparisonTable rows={[{ ...NVDA, bars: [{ ts: "2026-09-25", close: 220 }, { ts: "2026-09-26", close: 225.07 }] }]} timeframe="1M" />
    </DisplayPrefsProvider>
  );
}

// HoldingsTable is not rendered here: it imports a server action (deleteHolding)
// that pulls in server-only modules. Its price column is pinned by the source
// guard in native-currency.ts instead. TickerHero needs a mounted app router
// (LivePricePoll), so its "≈ €" hint is pinned through userEquivalent() there.

export function Note({ currency }: { currency: string }) {
  return <CurrencyNote prefs={prefsFor(currency)} />;
}
