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
