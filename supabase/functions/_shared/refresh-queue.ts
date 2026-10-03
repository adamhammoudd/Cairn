// Pure ordering + time-budget logic for ingest-market-data's daily refresh.
//
// Root cause (2026-10-02 audit, items 1.1/1.2): the job walked the configured
// symbol list in config order, one slow serial request at a time, then ran the
// on-demand pass last. A run is killed by the platform's wall-clock limit, so
// whatever sat at the END of that order (the 24 symbols migration 0026
// appended - ASML, TSM, BABA, IONQ, KTOS, PLAB, BROS, PENN - and every
// on-demand symbol such as a holding like ISRG) was cut off on every single
// run and never refreshed, while the head of the list refreshed daily. Nothing
// reordered by age, so the starvation was permanent.
//
// Fix: one queue for all sources, ordered held/watched first then stalest
// first, drained against a deadline. A run that is cut short still leaves the
// remainder at the front of tomorrow's queue, so no symbol can starve.

export interface RefreshCandidate {
  symbol: string;
  /** Last attempt, success or not. null = never attempted. */
  lastCheckedAt: string | null;
  /** Last successful refresh. null = never succeeded. */
  lastSuccessAt: string | null;
  /** Held in a portfolio or on a watchlist by someone. */
  prioritised: boolean;
}

/**
 * Held/watched symbols first; within a tier, the one whose data is oldest
 * first (never-succeeded before everything). Staleness is judged by
 * last_success_at - the age of the DATA - not last_checked_at, so a symbol
 * that keeps failing is retried but cannot jump ahead of one that has simply
 * never been tried.
 */
export function compareForRefresh(a: RefreshCandidate, b: RefreshCandidate): number {
  if (a.prioritised !== b.prioritised) return a.prioritised ? -1 : 1;
  const aKey = a.lastSuccessAt ?? "";
  const bKey = b.lastSuccessAt ?? "";
  if (aKey !== bKey) return aKey < bKey ? -1 : 1;
  const aChecked = a.lastCheckedAt ?? "";
  const bChecked = b.lastCheckedAt ?? "";
  if (aChecked !== bChecked) return aChecked < bChecked ? -1 : 1; // longest since an attempt first
  return a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0;
}

export function orderForRefresh<T extends RefreshCandidate>(candidates: readonly T[]): T[] {
  // De-duplicate on symbol so one symbol listed in config AND requested
  // on demand is fetched once; the prioritised/older record wins.
  const bySymbol = new Map<string, T>();
  for (const c of candidates) {
    const key = c.symbol.toUpperCase();
    const prev = bySymbol.get(key);
    if (!prev || compareForRefresh(c, prev) < 0) bySymbol.set(key, c);
  }
  return [...bySymbol.values()].sort(compareForRefresh);
}

export interface DrainResult<T> {
  done: T[];
  failed: { item: T; error: string }[];
  /** Not attempted because the deadline arrived first. */
  skipped: T[];
}

/**
 * Process `queue` in order until `deadlineMs` (epoch ms). One item throwing is
 * recorded and the loop moves on - it can never block the rest.
 */
export async function drainQueue<T>(
  queue: readonly T[],
  work: (item: T) => Promise<void>,
  deadlineMs: number,
  now: () => number = Date.now,
): Promise<DrainResult<T>> {
  const out: DrainResult<T> = { done: [], failed: [], skipped: [] };
  for (let i = 0; i < queue.length; i++) {
    if (now() >= deadlineMs) {
      out.skipped = queue.slice(i);
      break;
    }
    try {
      await work(queue[i]);
      out.done.push(queue[i]);
    } catch (err) {
      out.failed.push({ item: queue[i], error: err instanceof Error ? err.message : String(err) });
    }
  }
  return out;
}
