// The one date the Portfolio chart card prints as "Last close: ...".
//
// It used to be the newest bar across ALL holdings (latestDataDate), so one
// crypto holding - whose bar is dated today - made the card say "Close of
// Oct 2" while every equity beside it, and its own ticker page, said Oct 1
// (audit 2026-10-02, item 1.4). Now it is taken from the same per-symbol
// as-of dates the holdings table prints, and an exchange-traded close is
// preferred over a crypto bar, because "close" means the exchange close.

export interface HeldAsOf {
  symbol: string;
  assetType: string | null | undefined;
  asOf: string | null | undefined;
}

export function portfolioCloseDate(held: readonly HeldAsOf[]): string | null {
  const newest = (rows: readonly HeldAsOf[]) =>
    rows.reduce<string | null>((n, r) => (r.asOf && (!n || r.asOf > n) ? r.asOf : n), null);
  const exchange = held.filter((h) => h.assetType !== "crypto");
  return newest(exchange) ?? newest(held);
}
