// Market-data adapters produce OHLCV bars (distinct shape from news adapters —
// this feeds historical_prices, the Phase 4 pattern-matching trend store).

export interface PriceBar {
  symbol: string;
  asset_type: "equity" | "etf" | "crypto" | "forex" | "future";
  ts: string; // YYYY-MM-DD
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}

// Yahoo Finance's chart endpoint is free and keyless. Stooq's CSV endpoint
// (the original choice here) now sits behind a JS proof-of-work bot check
// that a server-side fetch can't solve, so it's not usable from an Edge
// Function — this replaced it after that was confirmed against the live API.
export async function fetchYahooFinanceDaily(
  symbol: string,
  assetType: PriceBar["asset_type"],
  range = "2y",
): Promise<PriceBar[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (cairn-ingest/1.0)" } });
  if (!res.ok) throw new Error(`yahoo ${symbol}: HTTP ${res.status}`);

  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) return [];

  const timestamps: number[] = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0] ?? {};
  const { open = [], high = [], low = [], close = [], volume = [] } = quote as Record<string, (number | null)[]>;

  return timestamps.map((ts, i) => ({
    symbol: symbol.toUpperCase(),
    asset_type: assetType,
    ts: new Date(ts * 1000).toISOString().slice(0, 10),
    open: open[i] ?? null,
    high: high[i] ?? null,
    low: low[i] ?? null,
    close: close[i] ?? null,
    volume: volume[i] ?? null,
  }));
}
