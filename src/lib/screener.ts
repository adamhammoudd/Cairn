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
}

export interface ScreenerRow {
  symbol: string;
  assetType: string;
  price: number | null;
  changePct: number | null;
  volume: number | null;
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
};

export const ASSET_TYPES = ["equity", "etf", "crypto", "forex", "future"] as const;
