// Pure windowing logic for the intraday (1D / 1W) chart feed, split out of the
// "use server" action in lib/actions/intraday.ts so it can be unit-tested (a
// "use server" module may only export async functions).
//
// The behaviour that matters: the window is anchored to the NEWEST bar, not to
// "now". When the market is closed the newest bar can be Friday's 4pm print;
// anchoring on "now" (as the old `withinSpan` filter did) discarded every one
// of those bars and the chart rendered "No intraday bars for this range". Yahoo
// Finance shows the last session instead - so do we, labelled "as of <date>".

import type { TimelinePoint } from "@/lib/portfolio";

export const RANGES = {
  "1D": { interval: "1min" as const, outputsize: 400, spanMs: 24 * 60 * 60 * 1000 },
  "1W": { interval: "15min" as const, outputsize: 700, spanMs: 7 * 24 * 60 * 60 * 1000 },
};

export type IntradayView = keyof typeof RANGES;

export interface IntradayResult {
  points: TimelinePoint[];
  /** False when no provider returned usable bars, so the UI can say why. */
  available: boolean;
  /**
   * True when the newest bar is not from the current session - the market is
   * closed and these points are the most recent session's, not live. The UI
   * labels them "as of <date>" instead of "Live".
   */
  stale: boolean;
  /** UTC date (YYYY-MM-DD) of the newest bar shown. */
  asOf: string | null;
}

/** Newest bar older than this -> the feed is stale (market closed). */
export const STALE_AFTER_MS = 30 * 60 * 1000;

const utcDay = (t: number) => new Date(t).toISOString().slice(0, 10);

/**
 * Trim `bars` to the window `view` asks for, anchored to the newest bar.
 * `now` is injectable for tests; it defaults to the wall clock.
 */
export function windowBars(
  bars: { ts: string; close: number | null }[],
  view: IntradayView,
  spanMs: number,
  now: number = Date.now(),
): { points: TimelinePoint[]; stale: boolean; asOf: string | null } {
  const usable = bars
    .filter((b) => b.close !== null && Number.isFinite(new Date(b.ts).getTime()))
    .map((b) => ({ date: b.ts, value: Number(b.close), t: new Date(b.ts).getTime() }))
    .sort((a, b) => a.t - b.t);
  if (usable.length === 0) return { points: [], stale: false, asOf: null };

  const lastT = usable[usable.length - 1].t;
  const anchor = Math.min(now, lastT); // closed market -> anchor on the last bar
  let windowed = usable.filter((p) => p.t <= now && p.t >= anchor - spanMs);

  // 1D is a single session; keep only the most recent day present.
  if (view === "1D" && windowed.length > 0) {
    const lastDay = utcDay(windowed[windowed.length - 1].t);
    windowed = windowed.filter((p) => utcDay(p.t) === lastDay);
  }

  return {
    points: windowed.map(({ date, value }) => ({ date, value })),
    stale: now - lastT > STALE_AFTER_MS,
    asOf: utcDay(lastT),
  };
}

/** Last close at or before `ts` (binary search - `rows` must be ascending by ts). */
export function closeAtOrBefore(rows: { ts: number; close: number }[], ts: number): number | null {
  let lo = 0;
  let hi = rows.length - 1;
  let hit = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (rows[mid].ts <= ts) {
      hit = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return hit === -1 ? null : rows[hit].close;
}

export interface HoldingLot {
  symbol: string;
  quantity: number;
  /** Epoch ms; the lot contributes only at grid points at or after this. */
  purchaseMs: number;
}

/**
 * Portfolio value on a shared intraday grid. Every lot contributes at every
 * grid point at or after its purchase: the last of its in-window bars, or -
 * before its first in-window bar - the price carried from before the window
 * opened (`seed`). A lot whose symbol has neither an in-window series nor a
 * seed contributes nothing rather than dropping the whole point to zero, so a
 * chart of five holdings still reads as five holdings when one has no intraday
 * data. Points are not filtered here; the caller drops leading zeros.
 */
export function composePortfolioSeries(
  grid: number[],
  lots: HoldingLot[],
  windowed: Map<string, { ts: number; close: number }[]>,
  seed: Map<string, number>,
): TimelinePoint[] {
  return grid.map((ts) => {
    let value = 0;
    for (const lot of lots) {
      if (lot.purchaseMs > ts) continue;
      const rows = windowed.get(lot.symbol);
      const inWindow = rows && rows.length > 0 ? closeAtOrBefore(rows, ts) : null;
      const price = inWindow ?? seed.get(lot.symbol) ?? null;
      if (price != null) value += price * lot.quantity;
    }
    return { date: new Date(ts).toISOString(), value };
  });
}

/**
 * The shared window for a multi-symbol (portfolio) series: one anchor across
 * every symbol's bars so they line up on the same grid.
 */
export function sessionWindow(
  allTs: number[],
  view: IntradayView,
  spanMs: number,
  now: number = Date.now(),
): { keep: (t: number) => boolean; stale: boolean; asOf: string | null } {
  if (allTs.length === 0) return { keep: () => false, stale: false, asOf: null };
  const lastT = Math.max(...allTs);
  const anchor = Math.min(now, lastT);
  const lastDay = utcDay(lastT);
  return {
    keep: (t: number) => {
      if (t > now || t < anchor - spanMs) return false;
      return view !== "1D" || utcDay(t) === lastDay;
    },
    stale: now - lastT > STALE_AFTER_MS,
    asOf: lastDay,
  };
}
