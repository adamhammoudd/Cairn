// Which symbols lead the ticker strip and the Compare quick-add chips.
//
// HOW IT PICKS (audit 2026-10-02, item 5.5):
//   1. symbols the reader HOLDS, in the order they hold them;
//   2. then symbols on their WATCHLISTS;
//   3. then everything else by MARKET CAP, largest first - but only symbols whose
//      market cap is at least MIN_SUGGEST_MARKET_CAP. A symbol with no known market
//      cap, or a tiny one, is never suggested on its own.
// Ties break on the symbol so the order is the same on every load.
//
// What it replaces: the strip ranked by |percent move| and the chips by
// alphabet. A coin with a market cap of a few hundred thousand dollars that moved
// +400% (BULLA, BLORB, CASHCAT) led the strip, and the chips offered "1INCH, 2Z,
// A7A5". A big move on a tiny asset is noise; the reader's own symbols and the
// large, widely held ones are what a first glance should show. Nothing here
// hides a symbol from search, from the Markets table or from the reader's own
// lists - it only decides what is promoted.

/** US dollars. Below this a symbol is not promoted unless the reader holds or watches it. */
export const MIN_SUGGEST_MARKET_CAP = 1_000_000_000;

export interface Rankable {
  symbol: string;
  marketCap: number | null;
}

/** Fills in a coin's market cap where the row has none (screener rows only carry a cap for equities). */
export function withCoinCaps<T extends Rankable>(rows: readonly T[], coinCaps: Readonly<Record<string, number>>): T[] {
  return rows.map((r) => (r.marketCap === null && coinCaps[r.symbol] !== undefined ? { ...r, marketCap: coinCaps[r.symbol] } : r));
}

export function rankForDisplay<T extends Rankable>(
  rows: readonly T[],
  opts: { held?: readonly string[]; watched?: readonly string[]; limit: number; minMarketCap?: number },
): T[] {
  const floor = opts.minMarketCap ?? MIN_SUGGEST_MARKET_CAP;
  const bySymbol = new Map<string, T>();
  for (const r of rows) bySymbol.set(r.symbol.toUpperCase(), r);

  const out: T[] = [];
  const seen = new Set<string>();
  const take = (symbol: string) => {
    const key = symbol.toUpperCase();
    const row = bySymbol.get(key);
    if (row && !seen.has(key)) {
      seen.add(key);
      out.push(row);
    }
  };
  for (const s of opts.held ?? []) take(s);
  for (const s of opts.watched ?? []) take(s);

  const rest = rows
    .filter((r) => !seen.has(r.symbol.toUpperCase()) && r.marketCap !== null && r.marketCap >= floor)
    .sort((a, b) => (b.marketCap as number) - (a.marketCap as number) || a.symbol.localeCompare(b.symbol));
  for (const r of rest) take(r.symbol);
  return out.slice(0, opts.limit);
}
