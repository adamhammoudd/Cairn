// Pure staleness rule for a fallen-back-to daily close. Lives apart from
// current-price.ts because that module imports the server Supabase client and
// client components need this too.

// How old a fallen-back-to daily close can be before Holdings should say so
// rather than silently presenting it as the current price. Crypto trades
// every calendar day, so a gap past ~a day and a half is a real ingestion
// gap, not a weekend; equities/ETFs only trade on the exchange calendar, so
// the same gap is routine over a long weekend and needs a much wider berth.
export const STALE_AFTER_HOURS: Record<"crypto" | "other", number> = { crypto: 36, other: 96 };

export function isStaleClose(assetType: string | undefined, asOf: string | null, now = new Date()): boolean {
  if (!asOf) return false;
  const ageMs = now.getTime() - new Date(`${asOf}T00:00:00Z`).getTime();
  const limitHours = assetType === "crypto" ? STALE_AFTER_HOURS.crypto : STALE_AFTER_HOURS.other;
  return ageMs > limitHours * 60 * 60 * 1000;
}
