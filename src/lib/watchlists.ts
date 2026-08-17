// Types and constants for watchlists. Kept out of lib/actions/watchlists.ts
// for the same reason as lib/screener.ts / lib/crypto.ts -- a "use server"
// module may only export async functions.

export interface WatchlistItemWithData {
  id: string;
  symbol: string;
  sort_order: number;
  latestClose: number | null;
  changePct: number | null;
  sparkline: number[];
}

export interface DisplayPrefs {
  sortBy: "manual" | "symbol" | "price" | "change";
  showSparkline: boolean;
}

export const DEFAULT_DISPLAY_PREFS: DisplayPrefs = { sortBy: "manual", showSparkline: true };

// Watchlists have no persisted color, but the list tabs read much better with
// one. Derive it from the id so a list keeps its tint across reorders without
// needing a schema column. Categorical only -- never gain/loss meaning.
const WATCHLIST_TINTS = ["bg-accent", "bg-info", "bg-violet", "bg-warning"] as const;

export function tintForWatchlist(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return WATCHLIST_TINTS[Math.abs(hash) % WATCHLIST_TINTS.length];
}

export function readDisplayPrefs(raw: unknown): DisplayPrefs {
  const r = (raw ?? {}) as Partial<DisplayPrefs>;
  return {
    sortBy: r.sortBy === "symbol" || r.sortBy === "price" || r.sortBy === "change" ? r.sortBy : "manual",
    showSparkline: r.showSparkline !== false,
  };
}

export interface WatchlistWithItems {
  id: string;
  name: string;
  description: string | null;
  displayPrefs: DisplayPrefs;
  sort_order: number;
  items: WatchlistItemWithData[];
}
