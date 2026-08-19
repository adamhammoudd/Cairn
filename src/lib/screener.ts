// Types and constants for the screener. Kept out of lib/actions/screener.ts
// because a "use server" module may only export async functions — a plain
// object export there is a build error.

export interface ScreenerFilters {
  assetTypes: string[];
  minPrice: number | null;
  maxPrice: number | null;
  minChangePct: number | null;
  maxChangePct: number | null;
  minVolume: number | null;
  /** Market cap in millions, to keep the input field short. */
  minMarketCapM: number | null;
  maxMarketCapM: number | null;
  minPe: number | null;
  maxPe: number | null;
  minDividendYield: number | null;
}

export interface ScreenerRow {
  symbol: string;
  assetType: string;
  price: number | null;
  changePct: number | null;
  volume: number | null;
  /** Up to the 12 most recent closes, oldest first, for a Trend sparkline. */
  trend: number[];
  /** Derived at query time from fundamentals + latest close, never stored. */
  marketCap: number | null;
  pe: number | null;
  dividendYield: number | null;
}

export interface SavedScreen {
  id: string;
  name: string;
  filters: ScreenerFilters;
}

export const EMPTY_FILTERS: ScreenerFilters = {
  assetTypes: [],
  minPrice: null,
  maxPrice: null,
  minChangePct: null,
  maxChangePct: null,
  minVolume: null,
  minMarketCapM: null,
  maxMarketCapM: null,
  minPe: null,
  maxPe: null,
  minDividendYield: null,
};

export const ASSET_TYPES = ["equity", "etf", "crypto", "forex", "future"] as const;

// Shared asset-type tag treatment for Markets + Screener rows: equity reads as
// primary (default/plain), etf=info, crypto=violet, forex=warning, and
// "future" (this app has no separate "index" type) takes the muted/index tone.
export const ASSET_TYPE_TAG_CLASS: Record<string, string> = {
  equity: "text-primary border-line",
  etf: "text-info border-info/30",
  crypto: "text-violet border-violet/30",
  forex: "text-warning border-warning/30",
  future: "text-muted border-line",
};

/** Filter-pill labels, matching the mock's wording. */
export const ASSET_TYPE_LABEL: Record<string, string> = {
  all: "All",
  equity: "Equities",
  etf: "ETFs",
  crypto: "Crypto",
  forex: "Forex",
  // The mock labels this filter Indices; the stored asset_type is future.
  future: "Indices",
};

/** Share volume, compacted the way the mock shows it ("22.4M"). */
export function formatVolume(n: number | null): string {
  if (n === null) return "—";
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString();
}

export function formatMarketCap(n: number | null): string {
  if (n === null) return "—";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toLocaleString()}`;
}
