// Drives the real intraday path the 1D/1W chart buttons call.
import "./tests/env";

async function main() {
  const { fetchIntradaySeries, isMarketDataProviderConfigured } = await import("@/lib/market-data/provider");
  console.log("provider configured:", isMarketDataProviderConfigured());

  const CASES: [string, "equity"|"etf"|"crypto"][] = [["NVDA","equity"],["SPY","etf"],["AXON","equity"],["BTC","crypto"],["ETH","crypto"],["SOL","crypto"]];
  for (const [symbol, assetType] of CASES) {
    for (const [label, interval] of [["1D", "1min"], ["1W", "15min"]] as const) {
      const bars = await fetchIntradaySeries(symbol, interval, 400, false, assetType);
      if (!bars || bars.length === 0) {
        console.log(`${symbol.padEnd(6)} ${label}  -> NO DATA`);
        continue;
      }
      console.log(
        `${symbol.padEnd(6)} ${label}  -> ${String(bars.length).padStart(4)} bars  ` +
          `${bars[0].ts.slice(0, 16)} .. ${bars[bars.length - 1].ts.slice(0, 16)}  last=${bars[bars.length - 1].close}`,
      );
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
