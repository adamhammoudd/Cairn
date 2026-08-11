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
