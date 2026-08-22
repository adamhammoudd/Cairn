"use server";

import { createClient } from "@/lib/supabase/server";
import type { CryptoRow } from "@/lib/crypto";

// Price isn't stored on crypto_metrics (it's an overview snapshot: cap,
// volume, supply, rank) - derive it from the latest ingested daily close so
// the overview and the ticker chart never disagree on price.
export async function getCryptoOverview(): Promise<CryptoRow[]> {
  const supabase = await createClient();

  // One bar per coin, with a per-symbol LIMIT. The previous query took the
  // newest 2000 crypto rows across all coins at once: at 25 coins that is 80
  // days each, but the cap is shared, so a coin whose history stops earlier
  // than the others (anything ingested on demand and not since refreshed)
  // falls outside the window and renders with no price at all.
  const [{ data: metrics }, { data: prices }] = await Promise.all([
    supabase.from("crypto_metrics").select("*").order("market_cap_rank", { ascending: true, nullsFirst: false }),
    supabase.rpc("recent_prices_all", { per_symbol: 1, asset_types: ["crypto"] }),
  ]);

  const latestClose = new Map<string, number>();
  const asOf = new Map<string, string>();
  for (const p of (prices ?? []) as { symbol: string; ts: string; close: number | null }[]) {
    if (!latestClose.has(p.symbol) && p.close !== null) {
      latestClose.set(p.symbol, Number(p.close));
      asOf.set(p.symbol, p.ts);
    }
  }

  return (metrics ?? []).map((m) => ({
    symbol: m.symbol,
    name: m.name,
    rank: m.market_cap_rank,
    price: latestClose.get(m.symbol) ?? null,
    asOf: asOf.get(m.symbol) ?? null,
    changePct24h: m.price_change_24h_pct,
    marketCap: m.market_cap,
    volume24h: m.total_volume_24h,
    circulatingSupply: m.circulating_supply,
    maxSupply: m.max_supply,
  }));
}
