// One decision, in one place, for what a price's date label says and whether
// the price is out of date. Pure, so the same rule feeds the ticker page, the
// portfolio, markets and the tests.
//
// Rules (audit 2026-10-02, items 1.3/1.4):
//  * "Live" / "Updates every N min" only ever sits next to a price from a live
//    quote. A stored daily close is shown as "Last close: <its own date>".
//  * The date is the date of the data, never today's date or a guess.
//  * A close older than the newest close that could exist is stale, and says
//    so in plain words, with the date.

import { expectedLatestCloseDate } from "@/lib/market-hours";
import { isStaleClose } from "@/lib/market-data/stale";

export interface PriceFreshness {
  /** True only for a genuine live quote. */
  live: boolean;
  stale: boolean;
  /** "Last close: 25 Sep" or "Live". */
  label: string;
  /** Plain-English reason, only when stale. */
  reason: string | null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "25 Sep", or "25 Sep 2025" when not this year. Hand-built: ICU spells September "Sept" in some locales. */
export function shortDate(iso: string, now: Date = new Date()): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS[m - 1]}${y !== now.getUTCFullYear() ? ` ${y}` : ""}`;
}

export function describePriceFreshness(opts: {
  source: "live" | "last_close";
  asOf: string | null | undefined;
  assetType?: string | null;
  now?: Date;
}): PriceFreshness {
  const now = opts.now ?? new Date();
  if (opts.source === "live") return { live: true, stale: false, label: "Live", reason: null };
  if (!opts.asOf) return { live: false, stale: false, label: "Last close: date unknown", reason: null };

  const stale =
    opts.assetType === "crypto"
      ? isStaleClose("crypto", opts.asOf, now)
      : opts.asOf < expectedLatestCloseDate(now);
  return {
    live: false,
    stale,
    label: `Last close: ${shortDate(opts.asOf, now)}`,
    reason: stale
      ? `Newer prices haven't reached Cairn for this symbol yet, so this is the latest we have (${shortDate(opts.asOf, now)}).`
      : null,
  };
}
