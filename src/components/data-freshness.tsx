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

import { describePriceFreshness } from "@/lib/price-freshness";

interface DataFreshnessProps {
  source: "live" | "last_close";
  /** YYYY-MM-DD of the bar the numbers came from. */
  asOf?: string | null;
  /** Extra words about what is being labelled, e.g. "daily closes". */
  detail?: string;
  /** Optional; lets crypto (trades daily) be judged by its own staleness rule. */
  assetType?: string | null;
  className?: string;
}

// The date comes from the data itself (describePriceFreshness), formatted with a
// fixed locale and zone so server and browser render the same string.
export function freshnessText({
  source,
  asOf,
  detail,
  assetType,
}: Omit<DataFreshnessProps, "className">): string {
  const f = describePriceFreshness({ source, asOf, assetType });
  return detail ? `${f.label} · ${detail}` : f.label;
}

export function DataFreshness({ source, asOf, detail, assetType, className = "" }: DataFreshnessProps) {
  const f = describePriceFreshness({ source, asOf, assetType });
  return (
    <span className={`inline-flex flex-col gap-0.5 ${className}`}>
      <span
        title={
          source === "live"
            ? "Prices from the live quote provider."
            : "These are stored daily closing prices, not a live feed."
        }
        // Wraps on a phone: on one line the ticker chart's label ran past its card at 360px and was cut.
        className="font-mono text-eyebrow text-dim uppercase sm:whitespace-nowrap"
      >
        {freshnessText({ source, asOf, detail, assetType })}
      </span>
      {f.reason && <span className="text-micro text-negative">{f.reason}</span>}
    </span>
  );
}
