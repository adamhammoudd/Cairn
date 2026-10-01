// Types and constants for watchlists. Kept out of lib/actions/watchlists.ts
// for the same reason as lib/screener.ts / lib/crypto.ts -- a "use server"
// module may only export async functions.

export interface WatchlistItemWithData {
  id: string;
  symbol: string;
  sort_order: number;
  latestClose: number | null;
  /** Date of the close behind `latestClose`, YYYY-MM-DD. */
  asOf?: string | null;
  changePct: number | null;
  sparkline: number[];
  /** Quote currency of latestClose and the sparkline, never converted. Null = unknown. */
  currency: string | null;
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

// Literal class names per tint, so Tailwind sees every one. The avatar, the
// list dot and the count badge all draw from the same hue.
export const WATCHLIST_TINT_CLASSES: Record<string, { dot: string; avatar: string; count: string }> = {
  "bg-accent": { dot: "bg-accent", avatar: "border-accent/35 bg-accent/12 text-accent", count: "bg-accent/15 text-accent" },
  "bg-info": { dot: "bg-info", avatar: "border-info/35 bg-info/12 text-info", count: "bg-info/15 text-info" },
  "bg-violet": { dot: "bg-violet", avatar: "border-violet/35 bg-violet/12 text-violet", count: "bg-violet/15 text-violet" },
  "bg-warning": { dot: "bg-warning", avatar: "border-warning/35 bg-warning/12 text-warning", count: "bg-warning/15 text-warning" },
};

export function tintClassesForWatchlist(id: string) {
  return WATCHLIST_TINT_CLASSES[tintForWatchlist(id)];
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
