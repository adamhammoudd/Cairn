// Pure logic behind the price-polling on the ticker and portfolio pages,
// split out from the React hook (src/components/use-live-refresh.ts) and the
// wrapper component (src/components/live-price-poll.tsx) so it can be unit
// tested without a renderer.

// The live-quote provider (Twelve Data, "basic" tier) allows 8 requests per
// minute on ONE shared key. A portfolio with 8 holdings already spends that
// whole budget in a single refresh, so quote-bearing pages never poll faster
// than this - however low the user drops "Refresh rate" in Settings. Slower
// than 60s (the 5-minute option) is still honoured.
export const MIN_QUOTE_POLL_SECONDS = 60;

/** The interval a quote-bearing page actually polls at, given the user's setting. */
export function resolveQuotePollSeconds(refreshRateSeconds: number | null | undefined): number {
  const n = Number(refreshRateSeconds);
  const wanted = Number.isFinite(n) && n > 0 ? n : MIN_QUOTE_POLL_SECONDS;
  return Math.max(MIN_QUOTE_POLL_SECONDS, wanted);
}

/**
 * Whether a poll should be running right now. All three must hold:
 *  - not paused by the user,
 *  - the market is open (a poll at 3am refetches yesterday's close),
 *  - the tab is visible (a backgrounded tab polling for a day is thousands of
 *    pointless requests against a rate-limited key).
 */
export function shouldPoll(opts: { paused: boolean; marketOpen: boolean; tabVisible: boolean }): boolean {
  return !opts.paused && opts.marketOpen && opts.tabVisible;
}
