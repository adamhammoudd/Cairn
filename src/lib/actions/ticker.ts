"use server";

import { createClient } from "@/lib/supabase/server";
import type { AssetType } from "@/lib/supabase/types";

export interface TickerData {
  symbol: string;
  assetType: AssetType;
  bars: { ts: string; close: number | null }[];
  price: number | null;
  changePct: number | null;
  volume: number | null;
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
  esg: { environmental: number | null; social: number | null; governance: number | null; total: number | null; source: string } | null;
}

// Asset type is read off the ingested price history rather than a hardcoded
// list, same as the AI engine's crypto detection in lib/ai/generate.ts — a
// newly-tracked symbol of any type routes correctly the moment its price
// history lands, with no second place to update.
export async function getTickerDetail(symbolRaw: string): Promise<TickerData | null> {
  const symbol = symbolRaw.toUpperCase();
  const supabase = await createClient();

  const { data: bars } = await supabase
    .from("historical_prices")
    .select("ts, close, volume, asset_type")
    .eq("symbol", symbol)
    .order("ts", { ascending: true })
    .limit(400);

  if (!bars || bars.length === 0) return null;

  const latest = bars[bars.length - 1];
  const prev = bars.length > 1 ? bars[bars.length - 2].close : null;
  const changePct =
    latest.close !== null && prev !== null && prev !== 0 ? ((latest.close - prev) / prev) * 100 : null;

  const [{ data: fundamentals }, { data: cryptoMetrics }, { data: news }, { data: esg }] = await Promise.all([
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
      .from("esg_scores")
      .select("environmental, social, governance, total, source")
      .eq("symbol", symbol)
      .order("as_of_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    symbol,
    assetType: latest.asset_type,
    bars: bars.map((b) => ({ ts: b.ts, close: b.close })),
    price: latest.close,
    changePct,
    volume: latest.volume,
    fundamentals: fundamentals ?? null,
    cryptoMetrics: cryptoMetrics ?? null,
    news: news ?? [],
    esg: esg ?? null,
  };
}
