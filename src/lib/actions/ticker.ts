"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentPrice } from "@/lib/market-data/current-price";
import type { AssetType } from "@/lib/supabase/types";

export interface TickerData {
  symbol: string;
  assetType: AssetType;
  bars: { ts: string; close: number | null }[];
  price: number | null;
  changePct: number | null;
  volume: number | null;
  priceSource: "live" | "last_close";
  fundamentals: { shares_outstanding: number | null; eps_ttm: number | null; dividends_ttm: number | null } | null;
  cryptoMetrics: {
    name: string;
    market_cap: number | null;
    total_volume_24h: number | null;
    circulating_supply: number | null;
    max_supply: number | null;
    market_cap_rank: number | null;
  } | null;
  news: { id: string; title: string; source_name: string; url: string | null; published_at: string }[];
  /** Session and range figures the mock header cards show. */
  open: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  week52High: number | null;
  week52Low: number | null;
  /** Annualised stdev of the last 30 daily returns, in percent. */
  volatility30d: number | null;
  nextEvent: { event_type: string; event_date: string } | null;
  esg: { environmental: number | null; social: number | null; governance: number | null; total: number | null; source: string } | null;
}

// Asset type is read off the ingested price history rather than a hardcoded
// list, same as the AI engine's crypto detection in lib/ai/generate.ts — a
// newly-tracked symbol of any type routes correctly the moment its price
// history lands, with no second place to update.
export async function getTickerDetail(symbolRaw: string): Promise<TickerData | null> {
  const symbol = symbolRaw.toUpperCase();
  const supabase = await createClient();

  // Newest-first at the DB so the LIMIT keeps the most recent 400 bars, then
  // reversed to ascending for the chart series and the `bars[last]` reads
  // below. Ordering ascending here silently returned the *oldest* 400 rows.
  const { data: recentBarsDesc } = await supabase
    .from("historical_prices")
    .select("ts, open, high, low, close, volume, asset_type")
    .eq("symbol", symbol)
    .order("ts", { ascending: false })
    .limit(400);

  if (!recentBarsDesc || recentBarsDesc.length === 0) return null;
  const bars = recentBarsDesc.slice().reverse();

  const latest = bars[bars.length - 1];

  const [currentPrice, { data: fundamentals }, { data: cryptoMetrics }, { data: news }, { data: nextEvent }, { data: esg }] = await Promise.all([
    getCurrentPrice(symbol),
    supabase
      .from("fundamentals")
      .select("shares_outstanding, eps_ttm, dividends_ttm")
      .eq("symbol", symbol)
      .order("as_of_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("crypto_metrics")
      .select("name, market_cap, total_volume_24h, circulating_supply, max_supply, market_cap_rank")
      .eq("symbol", symbol)
      .maybeSingle(),
    supabase
      .from("news_items")
      .select("id, title, source_name, url, published_at")
      .contains("tickers", [symbol])
      .order("published_at", { ascending: false })
      .limit(15),
    supabase
      .from("calendar_events")
      .select("event_type, event_date")
      .eq("symbol", symbol)
      .gte("event_date", new Date().toISOString().slice(0, 10))
      .order("event_date", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("esg_scores")
      .select("environmental, social, governance, total, source")
      .eq("symbol", symbol)
      .order("as_of_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  // 52-week range and 30-day volatility are derived here rather than stored,
  // the same rule the screener follows for market cap: no second copy to age.
  const yearAgo = new Date();
  yearAgo.setDate(yearAgo.getDate() - 365);
  const yearIso = yearAgo.toISOString().slice(0, 10);
  // Range over intraday high/low, the convention every quote page uses --
  // deriving it from closes understates the band (it reported a 340.08 high
  // on a symbol that traded to 344.57).
  const yearBars = bars.filter((b) => b.ts >= yearIso);
  const yearHighs = yearBars.filter((b) => b.high !== null).map((b) => Number(b.high));
  const yearLows = yearBars.filter((b) => b.low !== null).map((b) => Number(b.low));

  const recent = bars.slice(-31).filter((b) => b.close !== null).map((b) => Number(b.close));
  let volatility30d: number | null = null;
  if (recent.length >= 10) {
    const returns = recent.slice(1).map((c, i) => Math.log(c / recent[i])).filter((r) => Number.isFinite(r));
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, r) => a + (r - mean) ** 2, 0) / returns.length;
    volatility30d = Math.sqrt(variance) * Math.sqrt(252) * 100;
  }

  return {
    symbol,
    assetType: latest.asset_type,
    bars: bars.map((b) => ({ ts: b.ts, close: b.close })),
    price: currentPrice.price ?? latest.close,
    changePct: currentPrice.changePct,
    volume: currentPrice.volume ?? latest.volume,
    priceSource: currentPrice.source,
    fundamentals: fundamentals ?? null,
    cryptoMetrics: cryptoMetrics ?? null,
    news: news ?? [],
    esg: esg ?? null,
    open: latest.open === null ? null : Number(latest.open),
    dayHigh: latest.high === null ? null : Number(latest.high),
    dayLow: latest.low === null ? null : Number(latest.low),
    week52High: yearHighs.length > 0 ? Math.max(...yearHighs) : null,
    week52Low: yearLows.length > 0 ? Math.min(...yearLows) : null,
    volatility30d,
    nextEvent: nextEvent ?? null,
  };
}
