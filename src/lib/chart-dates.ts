// Formatting for chart tick labels and tooltips, split by what the stored
// value actually represents.
//
// The bug this fixes: `historical_prices.ts` is a DATE column, serialised as
// "2026-08-28". `new Date("2026-08-28")` parses as UTC midnight, and the chart
// components are client components, so `.toLocaleDateString()` renders that
// instant in the VIEWER's time zone. For any viewer west of UTC every daily
// bar was labelled one calendar day early - Friday's close showing as "Thu",
// and the closed-market fallback ("as of Friday's close") disagreeing with the
// axis beneath it.
//
// A daily bar is a trading DAY, not an instant, so it must render as that same
// calendar date for every viewer -> format in UTC. Intraday bars ARE instants
// (a full ISO timestamp with a time component) and stay in the viewer's local
// zone, which is the intuitive reading of "where was the price at 2pm".

/** A full ISO timestamp (has a "T"/time part), vs. a bare YYYY-MM-DD date. */
export function isInstant(iso: string): boolean {
  return iso.length > 10;
}

/**
 * Format a chart label. `opts` is a Intl.DateTimeFormat options bag; for
 * date-only values `timeZone: "UTC"` is forced so the calendar date is stable
 * across viewers.
 */
export function formatChartLabel(iso: string, opts: Intl.DateTimeFormatOptions): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  if (isInstant(iso)) return date.toLocaleString(undefined, opts);
  return date.toLocaleDateString(undefined, { ...opts, timeZone: "UTC" });
}

/**
 * The chart tooltip's date/time line. Intraday points show a full local
 * date-time; daily bars show a full calendar date fixed to UTC, so the tooltip
 * agrees with the axis tick and the "as of <date>" freshness label.
 */
export function formatTooltipLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  if (isInstant(iso)) return date.toLocaleString();
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
