// Item 2 of the 2026-09-05 fix sweep: "Four cryptocurrencies are mistyped as
// equity or ETF." Confirmed the deeper root cause: these are real ticker-
// string collisions between a coin and an unrelated equity/ETF that happens
// to share the same symbol - symbol_directory has one row per symbol
// (primary key), so whichever instrument's on-demand ingest got there first
// won the only slot. This is the full-sweep check the task asked for
// ("compare every stored symbol's asset_type against its data provider's
// classification... list any OTHER mismatches"), re-runnable after
// supabase/migrations/0039_fix_crypto_ticker_collisions.sql is applied to
// confirm it actually took.
//
// A symbol is a mismatch when CoinGecko (crypto_metrics, populated by
// ingest-crypto) says it's a coin but symbol_directory disagrees. The
// reverse (tagged 'crypto' with no crypto_metrics row at all) is checked too,
// though none were found live - included so a future regression there is
// caught rather than silently missed.
//
// No FK relationship links crypto_metrics.symbol to symbol_directory.symbol
// (both just happen to use the same ticker strings), so this fetches each
// table separately and joins in JS rather than relying on PostgREST embedding.
//
// Run: npx tsx --conditions=react-server scripts/tests/crypto-asset-type-mismatches.ts
import "./env";
import { createAdminClient } from "@/lib/supabase/admin";

async function main() {
  const admin = createAdminClient();

  const { data: coins, error: coinsError } = await admin.from("crypto_metrics").select("symbol, name");
  const { data: directory, error: directoryError } = await admin.from("symbol_directory").select("symbol, asset_type, name");

  if (coinsError || directoryError) {
    console.error(`FAIL  could not read crypto_metrics/symbol_directory: ${coinsError?.message ?? directoryError?.message}`);
    process.exitCode = 1;
    return;
  }

  const directoryBySymbol = new Map((directory ?? []).map((r) => [r.symbol, r]));
  const coinSymbols = new Set((coins ?? []).map((c) => c.symbol));

  // A coin CoinGecko knows about, but symbol_directory disagrees is a coin.
  const mistagged = (coins ?? [])
    .map((coin) => ({ coin, directoryRow: directoryBySymbol.get(coin.symbol) }))
    .filter((r) => r.directoryRow && r.directoryRow.asset_type !== "crypto");

  // The reverse: tagged 'crypto' with no matching coin on file at all.
  const wronglyTaggedCrypto = (directory ?? []).filter((r) => r.asset_type === "crypto" && !coinSymbols.has(r.symbol));

  let failed = false;

  if (mistagged.length === 0) {
    console.log("pass  every crypto_metrics symbol is tagged 'crypto' in symbol_directory - no collisions found");
  } else {
    failed = true;
    console.log(`FAIL  ${mistagged.length} coin(s) tagged as something other than 'crypto' in symbol_directory:`);
    for (const { coin, directoryRow } of mistagged) {
      console.log(`      ${coin.symbol}: CoinGecko says "${coin.name}" (crypto), stored as ${directoryRow!.asset_type} ("${directoryRow!.name}")`);
    }
    console.log("      Fix: supabase/migrations/0039_fix_crypto_ticker_collisions.sql (needs to be applied)");
  }

  if (wronglyTaggedCrypto.length === 0) {
    console.log("pass  no symbol_directory row is tagged 'crypto' without a matching crypto_metrics entry");
  } else {
    failed = true;
    console.log(`FAIL  ${wronglyTaggedCrypto.length} row(s) tagged 'crypto' with no matching coin on file:`);
    for (const r of wronglyTaggedCrypto) console.log(`      ${r.symbol} ("${r.name}")`);
  }

  console.log(`\n${failed ? "FAIL" : "pass"} - crypto-asset-type-mismatches`);
  // process.exitCode (not process.exit()) so Node drains its in-flight
  // handles instead of hard-killing the process - process.exit() here raced
  // the admin client's cleanup and crashed with a libuv assertion instead of
  // reporting a clean exit code.
  process.exitCode = failed ? 1 : 0;
}

main();
