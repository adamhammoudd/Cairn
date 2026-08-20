"use server";

import { createClient } from "@/lib/supabase/server";
import type { CryptoRow } from "@/lib/crypto";

// Price isn't stored on crypto_metrics (it's an overview snapshot: cap,
// volume, supply, rank) - derive it from the latest ingested daily close so
// the overview and the ticker chart never disagree on price.
export async function getCryptoOverview(): Promise<CryptoRow[]> {
  const supabase = await createClient();

  const [{ data: metrics }, { data: prices }] = await Promise.all([
    supabase.from("crypto_metrics").select("*").order("market_cap_rank", { ascending: true, nullsFirst: false }),
    supabase
      .from("historical_prices")
      .select("symbol, ts, close")
      .eq("asset_type", "crypto")
      .order("ts", { ascending: false })
      .limit(2000),
  ]);

  const latestClose = new Map<string, number>();
  for (const p of prices ?? []) {
    if (!latestClose.has(p.symbol) && p.close !== null) latestClose.set(p.symbol, p.close);
  }

  return (metrics ?? []).map((m) => ({
    symbol: m.symbol,
    name: m.name,
    rank: m.market_cap_rank,
    price: latestClose.get(m.symbol) ?? null,
    changePct24h: m.price_change_24h_pct,
    marketCap: m.market_cap,
    volume24h: m.total_volume_24h,
    circulatingSupply: m.circulating_supply,
    maxSupply: m.max_supply,
  }));
}
