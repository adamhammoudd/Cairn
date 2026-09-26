// Regression test for fix/btc-symbol-mapping: one ticker, two instruments.
//
// Live-confirmed 2026-09-26: symbol_directory said BTC was "Grayscale Bitcoin
// Mini Trust ETF" (asset_type etf) and the newest stored BTC close was $37.16,
// while a user holds BTC as crypto. historical_prices held 541 ETF bars and
// 127 Bitcoin bars under the same symbol, because (symbol, ts) is the upsert
// key: on weekdays the ETF bar won, on weekends only the coin traded.
//
// How it happened:
//   1. The on-demand lookup tried the bare ticker first, even for a symbol the
//      directory already knew was a coin. Yahoo answers `BTC` with the ETF, so
//      a routine refresh re-filed Bitcoin as an ETF.
//   2. From then on the nightly on-demand pass (which skips crypto) refreshed
//      "BTC" from Yahoo every day and overwrote the coin's bars.
// The same collision runs the other way: ingest-crypto wrote CoinGecko coin
// prices under 58 tickers that belong to equities (CVX = Convex Finance, not
// Chevron; META carried MetaDAO rows next to Meta's).
//
// These cases cover the two code rules. The database guard that backs them
// up is tested in supabase/tests/asset_class_guard.sql.
//
// Run: npx tsx --conditions=react-server scripts/tests/asset-class-identity.ts

import { pathToFileURL } from "node:url";
import { providerCandidates } from "@/lib/market-data/ingest";
import {
  assetClassOf,
  isSameInstrumentClass,
  partitionCoinsByDirectory,
} from "../../supabase/functions/_shared/asset-class";
import { writeReport, type SuiteResult, type TestCase } from "./report";

function eq<T>(a: T, b: T): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function runAssetClassIdentitySuite(): SuiteResult {
  const cases: TestCase[] = [];
  const check = (name: string, ok: boolean, detail: string) => cases.push({ name, status: ok ? "pass" : "fail", detail });

  // --- 1. Which provider symbols a lookup may try -------------------------------
  // The bug: a known coin still tried the bare ticker first.
  const btcKnownCrypto = providerCandidates("BTC", "crypto");
  check(
    "a symbol the directory knows is a coin is only fetched as the coin pair",
    eq(btcKnownCrypto, ["BTC-USD"]),
    `providerCandidates("BTC", "crypto") = ${JSON.stringify(btcKnownCrypto)}; the bare "BTC" is the Grayscale ETF`,
  );

  const metaKnownEquity = providerCandidates("META", "equity");
  check(
    "a symbol the directory knows is an equity is never fetched as a coin pair",
    eq(metaKnownEquity, ["META"]),
    `providerCandidates("META", "equity") = ${JSON.stringify(metaKnownEquity)}; "META-USD" would be MetaDAO`,
  );

  const spyKnownEtf = providerCandidates("SPY", "etf");
  check("a known ETF is fetched under its own ticker only", eq(spyKnownEtf, ["SPY"]), JSON.stringify(spyKnownEtf));

  const fxKnown = providerCandidates("EURUSD", "forex");
  check(
    "a known forex pair goes straight to the provider's =X form",
    eq(fxKnown, ["EURUSD=X"]),
    `providerCandidates("EURUSD", "forex") = ${JSON.stringify(fxKnown)}`,
  );

  // A symbol nobody has looked up yet keeps today's order: a real equity
  // ticker still resolves as an equity first.
  const unknown = providerCandidates("BTC");
  check(
    "a never-seen symbol keeps the existing order (bare ticker, then coin pair)",
    eq(unknown, ["BTC", "BTC-USD"]),
    `providerCandidates("BTC") = ${JSON.stringify(unknown)}`,
  );
  check(
    "an explicit provider form is used as-is whatever the directory says",
    eq(providerCandidates("BTC-USD", "crypto"), ["BTC-USD"]) && eq(providerCandidates("^GSPC", "index"), ["^GSPC"]),
    `${JSON.stringify(providerCandidates("BTC-USD", "crypto"))} ${JSON.stringify(providerCandidates("^GSPC", "index"))}`,
  );

  // --- 2. Whether a provider answer may replace what the directory holds -----
  check("crypto vs ETF is a different instrument", isSameInstrumentClass("crypto", "etf") === false, 'isSameInstrumentClass("crypto", "etf")');
  check("equity vs crypto is a different instrument", isSameInstrumentClass("equity", "crypto") === false, 'isSameInstrumentClass("equity", "crypto")');
  check(
    "equity vs ETF is the same market-listed class (Yahoo relabels funds; no class change)",
    isSameInstrumentClass("equity", "etf") === true,
    'isSameInstrumentClass("equity", "etf")',
  );
  check("a never-seen symbol accepts whatever resolves", isSameInstrumentClass(null, "etf") === true, 'isSameInstrumentClass(null, "etf")');
  check(
    "asset classes: crypto is its own class, everything else is market-listed",
    assetClassOf("crypto") === "crypto" && assetClassOf("etf") === "listed" && assetClassOf("forex") === "listed" && assetClassOf(undefined) === null,
    `${assetClassOf("crypto")} ${assetClassOf("etf")} ${assetClassOf("forex")} ${assetClassOf(undefined)}`,
  );

  // --- 3. Which CoinGecko coins ingest-crypto may write history for ----------
  const coins = [{ symbol: "btc" }, { symbol: "cvx" }, { symbol: "meta" }, { symbol: "newcoin" }, { symbol: "apt" }];
  const directory = new Map<string, string>([
    ["BTC", "crypto"],
    ["CVX", "equity"],
    ["META", "equity"],
    ["APT", "crypto"],
  ]);
  const { keep, skipped } = partitionCoinsByDirectory(coins, directory);
  check(
    "coins the directory files as crypto, or has never seen, keep their history refresh",
    eq(keep.map((c) => c.symbol), ["btc", "newcoin", "apt"]),
    JSON.stringify(keep.map((c) => c.symbol)),
  );
  check(
    "coins whose ticker the directory files as an equity are skipped, with the reason",
    eq(skipped, [
      { symbol: "CVX", directoryAssetType: "equity" },
      { symbol: "META", directoryAssetType: "equity" },
    ]),
    JSON.stringify(skipped),
  );

  return { suiteName: "Asset-class identity (one ticker, two instruments)", gating: true, cases };
}

function main() {
  const suite = runAssetClassIdentitySuite();
  const reportPath = writeReport([suite]);
  console.log(`Report written to ${reportPath}`);
  const failed = suite.cases.filter((c) => c.status === "fail");
  for (const c of suite.cases) console.log(`${c.status === "pass" ? "PASS" : "FAIL"}: ${c.name} - ${c.detail}`);
  console.log(`${suite.cases.length - failed.length}/${suite.cases.length} passed.`);
  if (failed.length > 0) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
