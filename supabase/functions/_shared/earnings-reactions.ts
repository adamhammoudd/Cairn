// Earnings-day moves from a company's own SEC results releases, in the same
// shape as the curated rows ingest-historical-events writes from Nasdaq: the
// close on the last session strictly before the release and on the first
// session strictly after it. Shared by that Edge Function (every available
// US share, on its schedule) and the on-demand path an analysis runs
// (src/lib/market-data/company-data.ts), so both store the same move.
//
// Pure: no imports, no I/O.

export interface ReactionBar {
  /** ISO date, YYYY-MM-DD. */
  date: string;
  close: number | null;
  volume?: number | null;
}

/**
 * The one-session reaction window around `eventDate`. Bars ascending. Null if
 * either leg is missing, which is what makes an event unusable as an analog.
 */
export function reactionWindow(
  bars: ReactionBar[],
  eventDate: string,
): { before: number; after: number; volume: number | null } | null {
  let beforeIdx = -1;
  for (let i = 0; i < bars.length; i++) {
    if (bars[i].date < eventDate) beforeIdx = i;
    else break;
  }
  const afterIdx = bars.findIndex((b) => b.date > eventDate);
  if (beforeIdx === -1 || afterIdx === -1) return null;
  const before = bars[beforeIdx].close;
  const after = bars[afterIdx].close;
  if (before === null || after === null || Number(before) === 0) return null;
  const onDay = bars.find((b) => b.date === eventDate);
  return { before: Number(before), after: Number(after), volume: onDay?.volume ?? null };
}

export interface ReleaseRef {
  release_date: string;
  accn: string;
  timing?: string | null;
}

/**
 * historical_events rows (event_type "earnings") for each release with a
 * usable reaction window. Provenance is the 8-K accession number. Releases
 * outside the stored prices are skipped, never estimated.
 */
export function earningsReactionRows(symbol: string, releases: ReleaseRef[], bars: ReactionBar[]) {
  const rows: {
    symbol: string;
    sector: null;
    event_type: "earnings";
    event_date: string;
    description: string;
    price_before: number;
    price_after: number;
    volume_at_event: number | null;
    metadata: Record<string, unknown>;
  }[] = [];
  for (const r of releases) {
    const w = reactionWindow(bars, r.release_date);
    if (!w) continue;
    rows.push({
      symbol,
      sector: null,
      event_type: "earnings",
      event_date: r.release_date,
      description: `${symbol} released quarterly results (SEC 8-K item 2.02, accession ${r.accn})`,
      price_before: w.before,
      price_after: w.after,
      volume_at_event: w.volume,
      metadata: { source: "sec_8k_item_2_02", accn: r.accn, timing: r.timing ?? null },
    });
  }
  return rows;
}
