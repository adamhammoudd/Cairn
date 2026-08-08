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

// Stooq's CSV endpoint is free and keyless: https://stooq.com/q/d/l/?s=aapl.us&i=d
export async function fetchStooqDaily(symbol: string, assetType: PriceBar["asset_type"]): Promise<PriceBar[]> {
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(symbol)}&i=d`;
  const res = await fetch(url, { headers: { "User-Agent": "cairn-ingest/1.0" } });
  if (!res.ok) throw new Error(`stooq ${symbol}: HTTP ${res.status}`);

  const csv = await res.text();
  const lines = csv.trim().split("\n");
  if (lines.length < 2 || !lines[0].startsWith("Date")) return []; // symbol not found

  const bars: PriceBar[] = [];
  for (const line of lines.slice(1)) {
    const [date, open, high, low, close, volume] = line.split(",");
    if (!date) continue;
    bars.push({
      symbol: symbol.toUpperCase().replace(/\.US$/, ""),
      asset_type: assetType,
      ts: date,
      open: open ? Number(open) : null,
      high: high ? Number(high) : null,
      low: low ? Number(low) : null,
      close: close ? Number(close) : null,
      volume: volume ? Number(volume) : null,
    });
  }
  return bars;
}
