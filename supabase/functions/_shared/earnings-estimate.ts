// Next earnings date ESTIMATED from a company's own SEC filing history, for
// ingest-calendar. Pure: no network, no database, so the edge function and
// the test suite run the same code.
//
// SEC publishes no future dates, but companies report in a steady rhythm:
// NVIDIA's 8-K item 2.02 releases fell on 2024-11-20, 2025-11-19 and (per
// Nasdaq) 2026-11-18, each 52 weeks after the last. So the estimate is the
// same quarter's release a year earlier plus 364 days (same weekday). It is
// always stored and shown as an estimate (metadata.source = "sec_estimate",
// confirmed = false), with the date it was projected from and how far off
// the method has been for that company, and only where Nasdaq has no date.

const DAY = 86_400_000;
const days = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

/** 52 weeks: lands on the same weekday a year on. */
const YEAR = 364;
/** A projection this close after the latest real release is that quarter again, already reported. */
const SAME_QUARTER_DAYS = 45;
/** A release within this many days of last year's +52 weeks counts as the same quarter when measuring error. */
const MATCH_DAYS = 21;

export interface EarningsEstimate {
  date: string;
  /** The release a year earlier that the date is projected from. */
  basedOn: string;
  /** Median miss of this projection over the company's last four releases, in days; null if none could be checked. */
  typicalErrorDays: number | null;
}

export function estimateNextEarnings(releaseDates: string[], today: string, horizonDays: number): EarningsEstimate | null {
  const past = [...new Set(releaseDates)].filter((d) => d <= today).sort();
  if (past.length === 0) return null;
  const latest = past[past.length - 1];

  const next = past
    .map((d) => ({ basedOn: d, date: addDays(d, YEAR) }))
    .filter((c) => c.date >= today && days(today, c.date) <= horizonDays && days(latest, c.date) > SAME_QUARTER_DAYS)
    .sort((a, b) => (a.date < b.date ? -1 : 1))[0];
  if (!next) return null;

  // How well "last year + 52 weeks" predicted each of the last four releases.
  const errors: number[] = [];
  for (const r of past.slice(-4)) {
    const miss = past
      .filter((p) => p < r)
      .map((p) => Math.abs(days(addDays(p, YEAR), r)))
      .filter((m) => m <= MATCH_DAYS)
      .sort((a, b) => a - b)[0];
    if (miss !== undefined) errors.push(miss);
  }
  errors.sort((a, b) => a - b);
  const typicalErrorDays = errors.length ? errors[Math.floor((errors.length - 1) / 2)] : null;
  return { ...next, typicalErrorDays };
}

export interface CalendarRow {
  symbol: string | null;
  event_type: string;
  event_date: string;
  title: string;
  metadata: Record<string, unknown>;
}

/**
 * Nasdaq's rows plus an SEC estimate for every symbol with release history
 * and no Nasdaq earnings date inside the window.
 */
export function withEstimates(
  nasdaqRows: CalendarRow[],
  releasesBySymbol: Record<string, string[]>,
  today: string,
  horizonDays: number,
): CalendarRow[] {
  const end = addDays(today, horizonDays);
  const confirmed = new Set(
    nasdaqRows.filter((r) => r.event_type === "earnings" && r.event_date >= today && r.event_date <= end && r.symbol).map((r) => r.symbol as string),
  );
  const out = [...nasdaqRows];
  for (const [symbol, releases] of Object.entries(releasesBySymbol)) {
    if (confirmed.has(symbol)) continue;
    const e = estimateNextEarnings(releases, today, horizonDays);
    if (!e) continue;
    out.push({
      symbol,
      event_type: "earnings",
      event_date: e.date,
      title: `${symbol} - quarterly earnings (estimated)`,
      metadata: {
        source: "sec_estimate",
        confirmed: false,
        based_on: e.basedOn,
        method: "same quarter's SEC earnings release (8-K item 2.02) a year earlier + 52 weeks",
        typical_error_days: e.typicalErrorDays,
      },
    });
  }
  return out;
}

type SymbolRef = { symbol?: string } | string;

/** Provider-list, held and watched symbols, upper-cased. */
export function trackedSymbols(
  providers: { config: Record<string, unknown> | null }[],
  held: { symbol: string }[],
  watched: { symbol: string }[],
): Set<string> {
  const out = new Set<string>();
  for (const p of providers) {
    // config.symbols accepts plain strings and { symbol, asset_type } objects
    // (see ingest-market-data). Only the ticker matters here.
    const syms = Array.isArray(p.config?.symbols) ? (p.config!.symbols as SymbolRef[]) : [];
    for (const s of syms) {
      const sym = typeof s === "string" ? s : s?.symbol;
      if (typeof sym === "string") out.add(sym.toUpperCase());
    }
  }
  for (const r of [...held, ...watched]) out.add(r.symbol.toUpperCase());
  return out;
}
