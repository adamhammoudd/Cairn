// Last-session price move per symbol, shared by the app's briefing
// (src/lib/ai/briefing.ts) and the generate-daily-briefings edge function,
// which used to carry two copies of this loop.
//
// Feed it bars from recent_prices(symbols, 2), which gives every symbol its
// own two newest bars. Both callers used to read one shared window
// (`.in(symbols).order(ts desc).limit(n * 3)`), in which a symbol whose newest
// bar is older than the others' falls out and silently gets no move.

export interface MoveBar {
  symbol: string;
  ts: string;
  close: number | string | null;
}

export interface PriceMove {
  symbol: string;
  change_pct: number;
  close: number;
  as_of: string;
}

/**
 * Percentage move between each symbol's two newest bars, kept when its size
 * is at least `thresholdPct`. A symbol with fewer than two usable closes, or a
 * zero base, is skipped - never guessed. `as_of` is the newest bar's own date.
 */
export function priceMovesFromBars(bars: MoveBar[], thresholdPct: number): PriceMove[] {
  const bySymbol = new Map<string, { ts: string; close: number }[]>();
  for (const b of bars) {
    if (b.close === null || b.close === undefined) continue;
    const close = Number(b.close);
    if (!Number.isFinite(close)) continue;
    const arr = bySymbol.get(b.symbol) ?? [];
    arr.push({ ts: String(b.ts).slice(0, 10), close });
    bySymbol.set(b.symbol, arr);
  }

  const moves: PriceMove[] = [];
  for (const [symbol, rows] of [...bySymbol].sort(([a], [b]) => (a < b ? -1 : 1))) {
    rows.sort((a, b) => (a.ts < b.ts ? 1 : -1));
    if (rows.length < 2 || rows[1].close === 0) continue;
    const changePct = ((rows[0].close - rows[1].close) / rows[1].close) * 100;
    if (Math.abs(changePct) < thresholdPct) continue;
    moves.push({ symbol, change_pct: Math.round(changePct * 100) / 100, close: rows[0].close, as_of: rows[0].ts });
  }
  return moves;
}
