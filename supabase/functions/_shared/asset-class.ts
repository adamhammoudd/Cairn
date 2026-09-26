// One ticker can name two different instruments: `BTC` is Bitcoin and also
// the Grayscale Bitcoin Mini Trust ETF; `CVX` is Chevron and also Convex
// Finance's coin. historical_prices is keyed by (symbol, ts), so whichever
// ingest job writes last wins that date, and the stored history silently
// becomes a mix of two assets. Live on 2026-09-26 that had happened to 58
// tickers (BTC read $37.16; CVX was entirely Convex Finance).
//
// Until the table can hold both (see the PR for the keying decision), a
// symbol means exactly one instrument, and symbol_directory says which. These
// rules are shared by the app's on-demand lookup (src/lib/market-data/ingest.ts)
// and ingest-crypto, and migration 0047 enforces the same rule in the database.
//
// The only boundary that matters is coin vs market-listed. Equity vs ETF is
// not a collision: Yahoo labels funds and shares inconsistently, and both are
// the same listed security under the same ticker.

export type InstrumentClass = "crypto" | "listed";

export function assetClassOf(assetType: string | null | undefined): InstrumentClass | null {
  if (!assetType) return null;
  return assetType === "crypto" ? "crypto" : "listed";
}

/**
 * Whether a provider answer of type `resolved` may be stored under a symbol
 * the directory already files as `known`. A symbol nobody has resolved yet
 * (`known` null) accepts whatever resolves.
 */
export function isSameInstrumentClass(known: string | null | undefined, resolved: string | null | undefined): boolean {
  const k = assetClassOf(known);
  if (k === null) return true;
  return k === assetClassOf(resolved);
}

export interface SkippedCoin {
  symbol: string;
  directoryAssetType: string;
}

/**
 * Split CoinGecko's coin list into the coins ingest-crypto may write price
 * history (and derived events) for, and the ones whose ticker the directory
 * files as a listed security. The skipped list is returned so the run reports
 * it instead of dropping it quietly.
 *
 * `directoryTypes` maps upper-case symbol to symbol_directory.asset_type.
 */
export function partitionCoinsByDirectory<T extends { symbol: string }>(
  coins: T[],
  directoryTypes: Map<string, string>,
): { keep: T[]; skipped: SkippedCoin[] } {
  const keep: T[] = [];
  const skipped: SkippedCoin[] = [];
  for (const coin of coins) {
    const symbol = coin.symbol.toUpperCase();
    const known = directoryTypes.get(symbol);
    if (isSameInstrumentClass(known, "crypto")) keep.push(coin);
    else skipped.push({ symbol, directoryAssetType: known! });
  }
  return { keep, skipped };
}
