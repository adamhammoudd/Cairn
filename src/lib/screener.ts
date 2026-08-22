// Types and constants for the screener. Kept out of lib/actions/screener.ts
// because a "use server" module may only export async functions - a plain
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
  /** Provider display name, from symbol_directory. */
  name: string | null;
  price: number | null;
  changePct: number | null;
  volume: number | null;
  /** Date of the most recent bar behind `price`, YYYY-MM-DD. */
  asOf: string | null;
  /** Up to the 12 most recent closes, oldest first, for a Trend sparkline. */
  trend: number[];
  /** Derived at query time from fundamentals + latest close, never stored. */
  marketCap: number | null;
  pe: number | null;
  dividendYield: number | null;
  /** One-year extremes over intraday high/low, from symbol_52w_range(). */
  week52High: number | null;
  week52Low: number | null;
}

/**
 * How far the latest price sits below its one-year high, in percent (0 = at
 * the high). Null when either figure is missing, so a symbol with no range
 * simply drops out of a 52-week screen rather than sorting as if it were at
 * its high.
 */
export function pctBelow52wHigh(row: ScreenerRow): number | null {
  if (row.price === null || row.week52High === null || row.week52High === 0) return null;
  return ((row.week52High - row.price) / row.week52High) * 100;
}

/** How far the latest price sits above its one-year low, in percent. */
export function pctAbove52wLow(row: ScreenerRow): number | null {
  if (row.price === null || row.week52Low === null || row.week52Low === 0) return null;
  return ((row.price - row.week52Low) / row.week52Low) * 100;
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

export const ASSET_TYPES = ["equity", "etf", "crypto", "forex", "index"] as const;

// Shared asset-type tag treatment for Markets + Screener rows: equity reads as
// primary (default/plain), etf=info, crypto=violet, forex=warning, index muted.
export const ASSET_TYPE_TAG_CLASS: Record<string, string> = {
  equity: "text-primary border-line",
  etf: "text-info border-info/30",
  crypto: "text-violet border-violet/30",
  forex: "text-warning border-warning/30",
  index: "text-muted border-line",
  future: "text-muted border-line",
};

/** Filter-pill labels, matching the mock's wording. */
export const ASSET_TYPE_LABEL: Record<string, string> = {
  all: "All",
  equity: "Equities",
  etf: "ETFs",
  crypto: "Crypto",
  forex: "Forex",
  // `index` is now a real stored asset_type (migration 0027). It used to be
  // mapped onto `future`, so an index and a future were indistinguishable and
  // the Indices tab could only ever be as right as that guess.
  index: "Indices",
  future: "Futures",
};

/** Share volume, compacted the way the mock shows it ("22.4M"). */
export function formatVolume(n: number | null): string {
  if (n === null) return "-";
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString();
}

export function formatMarketCap(n: number | null): string {
  if (n === null) return "-";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toLocaleString()}`;
}


// ------------------------------------------------------------ preset screens
// The starting points a screener is expected to ship with. Each is a filter
// set plus an ordering, both stated in the UI, so a preset is a shortcut to a
// screen the user could have built by hand rather than an opaque list.
export type ScreenSort =
  | "change_desc"
  | "change_asc"
  | "volume_desc"
  | "near_52w_high"
  | "near_52w_low";

export interface PresetScreen {
  id: string;
  name: string;
  /** What it selects and how it orders, in words. Rendered beside the results. */
  method: string;
  filters: ScreenerFilters;
  sort: ScreenSort;
}

export const PRESET_SCREENS: PresetScreen[] = [
  {
    id: "gainers",
    name: "Day gainers",
    method: "Symbols up on the last session, ordered by percent change.",
    filters: { ...EMPTY_FILTERS, minChangePct: 0 },
    sort: "change_desc",
  },
  {
    id: "losers",
    name: "Day losers",
    method: "Symbols down on the last session, ordered by percent change.",
    filters: { ...EMPTY_FILTERS, maxChangePct: 0 },
    sort: "change_asc",
  },
  {
    id: "active",
    name: "Most active",
    method: "Ordered by the last session's traded volume, all asset types.",
    filters: { ...EMPTY_FILTERS },
    sort: "volume_desc",
  },
  {
    id: "high52",
    name: "Near 52-week highs",
    method: "Within 5% of the one-year high, closest first. The range is over intraday highs and lows.",
    filters: { ...EMPTY_FILTERS },
    sort: "near_52w_high",
  },
  {
    id: "low52",
    name: "Near 52-week lows",
    method: "Within 5% of the one-year low, closest first. The range is over intraday highs and lows.",
    filters: { ...EMPTY_FILTERS },
    sort: "near_52w_low",
  },
];

/** How close to an extreme a symbol has to be for the 52-week presets. */
export const NEAR_52W_PCT = 5;

/**
 * Apply a preset's ordering (and, for the 52-week presets, its proximity cut)
 * to rows already returned by runScreen. Kept out of the server action because
 * ordering a set the client already holds does not need a round trip - and
 * because sorting the full matching set is exact, not a top-N approximation.
 */
export function applyScreenSort(rows: ScreenerRow[], sort: ScreenSort): ScreenerRow[] {
  const by = (f: (r: ScreenerRow) => number | null, dir: 1 | -1) =>
    [...rows].sort((a, b) => {
      const av = f(a);
      const bv = f(b);
      // A symbol missing the figure being ranked sorts last in either
      // direction rather than winning the top slot as a null.
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return (bv - av) * dir;
    });

  switch (sort) {
    case "change_desc":
      return by((r) => r.changePct, 1);
    case "change_asc":
      return by((r) => r.changePct, -1);
    case "volume_desc":
      return by((r) => r.volume, 1);
    case "near_52w_high":
      return by((r) => pctBelow52wHigh(r), -1).filter((r) => {
        const d = pctBelow52wHigh(r);
        return d !== null && d <= NEAR_52W_PCT;
      });
    case "near_52w_low":
      return by((r) => pctAbove52wLow(r), -1).filter((r) => {
        const d = pctAbove52wLow(r);
        return d !== null && d <= NEAR_52W_PCT;
      });
  }
}
