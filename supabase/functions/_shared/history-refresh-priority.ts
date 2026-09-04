// Pure priority logic for ingest-crypto's history-refresh queue.
//
// Root cause (2026-09-04 walkthrough, item 1, escalation E2): the queue was
// "stalest first" across the WHOLE tracked universe (up to `top_n` = 250
// coins), with a fixed HISTORY_COINS_PER_RUN = 4 budget per 2-hour run. At
// that rate a coin waits up to ~4 days for its turn regardless of who
// actually holds or watches it - live-confirmed: BTC's historical_prices
// bars were 5 days stale despite BTC being the single most-held coin in the
// app. Raising the per-run budget has real cost/rate-limit implications
// (CoinGecko's free tier), so that's a decision for the founder, not this
// module. This is the no-cost-impact half: a coin someone actually holds or
// watches is refreshed ahead of the generic long tail every run, within the
// SAME request budget - it changes ordering, not volume.

export interface HistoryCandidate {
  symbol: string;
  /** ISO date of the newest bar already stored, or "" if never ingested. */
  freshestBarTs: string;
  marketCapRank: number | null;
}

/**
 * Ordering for the history-refresh queue: held/watched symbols first (in
 * their existing stalest-first order among themselves), then everything
 * else stalest-first as before. `prioritySymbols` should already be
 * upper-cased - matching is case-sensitive on purpose so the caller controls
 * normalization once, not on every comparison.
 */
export function compareForHistoryRefresh(
  a: HistoryCandidate,
  b: HistoryCandidate,
  prioritySymbols: ReadonlySet<string>,
): number {
  const aPriority = prioritySymbols.has(a.symbol) ? 0 : 1;
  const bPriority = prioritySymbols.has(b.symbol) ? 0 : 1;
  if (aPriority !== bPriority) return aPriority - bPriority;

  if (a.freshestBarTs !== b.freshestBarTs) return a.freshestBarTs < b.freshestBarTs ? -1 : 1; // never-ingested ("") first
  return (a.marketCapRank ?? 999) - (b.marketCapRank ?? 999);
}
