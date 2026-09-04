import type { ScreenerRow } from "@/lib/screener";

// Shared ranking definitions for the Markets page's "Day gainers / Day
// losers / Most active / Most searched" decks - used by both the small
// TrendingDeck card row and the main ranked table underneath it, so they can
// never rank differently from each other again.
//
// Root cause (2026-09-04 walkthrough, finding #4): TrendingDeck owned its
// `deck` tab state entirely by itself, and MarketsPanel's table only ever
// sorted by tab (asset type) + search query - nothing connected the deck
// selection to the table's row order, so clicking a tab moved the cards but
// left the table showing whatever order runScreen() happened to return.

export type DeckId = "gainers" | "losers" | "active" | "searched";

export const DECKS: { id: DeckId; label: string; method: string }[] = [
  { id: "gainers", label: "Day gainers", method: "Ranked by the last session's percent change, largest first." },
  { id: "losers", label: "Day losers", method: "Ranked by the last session's percent change, most negative first." },
  { id: "active", label: "Most active", method: "Ranked by the last session's traded volume." },
  { id: "searched", label: "Most searched", method: "Ranked by how many times this deployment has been asked for the symbol." },
];

/** The figure a deck ranks by, for one row - null when that row has nothing to rank on. */
export function deckValue(row: ScreenerRow, deck: DeckId, requestCounts: Record<string, number>): number | null {
  switch (deck) {
    case "gainers":
    case "losers":
      return row.changePct;
    case "active":
      return row.volume;
    case "searched": {
      const count = requestCounts[row.symbol] ?? 0;
      return count > 0 ? count : null;
    }
  }
}

/**
 * Comparator for a deck's ranking. Rows with no value for this deck (e.g. no
 * changePct yet) sink to the end rather than being dropped - the caller
 * decides whether to filter them out first (TrendingDeck's top-6 cards do;
 * the full table does not, so it never silently loses a row switching tabs).
 */
export function deckComparator(
  deck: DeckId,
  requestCounts: Record<string, number>,
): (a: ScreenerRow, b: ScreenerRow) => number {
  const ascending = deck === "losers";
  return (a, b) => {
    const av = deckValue(a, deck, requestCounts);
    const bv = deckValue(b, deck, requestCounts);
    if (av === null && bv === null) return a.symbol.localeCompare(b.symbol);
    if (av === null) return 1;
    if (bv === null) return -1;
    // A tie renders the same order on every load, rather than following
    // whatever order the rows happened to arrive in from the caller.
    if (av === bv) return a.symbol.localeCompare(b.symbol);
    return ascending ? av - bv : bv - av;
  };
}

/**
 * "Most searched" needs at least two different counts to mean anything - on
 * a fresh deployment where nothing (or everything) has been searched the
 * same number of times, there is no "most" to show. Shared so the table and
 * the card deck agree on when that's true.
 */
export function deckHasSignal(rows: ScreenerRow[], deck: DeckId, requestCounts: Record<string, number>): boolean {
  if (deck !== "searched") return true;
  const counts = rows.map((r) => requestCounts[r.symbol] ?? 0).filter((c) => c > 0);
  return counts.length > 0 && Math.max(...counts) !== Math.min(...counts);
}
