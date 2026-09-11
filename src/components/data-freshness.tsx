// One freshness label, used by every surface that prints a price.
//
// Before this, the ticker chart card said "DELAYED · DAILY CLOSES" and nothing
// else did: Markets, Watchlists, Screener, Portfolio, Compare and the Sector
// map all showed the same last-close numbers with no indication they were not
// live, and the dashboard showed a green "Live" pill beside them. A reader had
// no way to tell which screens were current. Since the app has no live-quote
// provider configured, "delayed" is the truthful answer everywhere, and it is
// only worth saying if it is said consistently.
//
// Deliberately not hidden when a live feed IS configured: it flips to "Live",
// so the label always states the actual source rather than disappearing.

interface DataFreshnessProps {
  source: "live" | "last_close";
  /** YYYY-MM-DD of the bar the numbers came from. */
  asOf?: string | null;
  /** Extra words about what is being labelled, e.g. "daily closes". */
  detail?: string;
  className?: string;
}

// Fixed locale and time zone: a date formatted with the server's locale and
// then re-formatted with the browser's is a hydration mismatch, and this
// string is small enough that a stable format is better than a local one.
function formatAsOf(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function freshnessText({ source, asOf, detail }: Omit<DataFreshnessProps, "className">): string {
  if (source === "live") return detail ? `Live · ${detail}` : "Live";
  const parts = ["Delayed"];
  if (detail) parts.push(detail);
  if (asOf) parts.push(`close of ${formatAsOf(asOf)}`);
  return parts.join(" · ");
}

export function DataFreshness({ source, asOf, detail, className = "" }: DataFreshnessProps) {
  return (
    <span
      title={
        source === "live"
          ? "Prices from the live quote provider."
          : "No live-quote provider is configured, so prices are the last daily close from the trend store."
      }
      className={`font-mono text-eyebrow whitespace-nowrap text-dim uppercase ${className}`}
    >
      {freshnessText({ source, asOf, detail })}
    </span>
  );
}
