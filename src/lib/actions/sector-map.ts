"use server";

import { createClient } from "@/lib/supabase/server";
import { getTrackedSymbols } from "@/lib/actions/comparison";
import type { SectorMapNode } from "@/lib/sector-map";

export async function getSectorHeatmap(): Promise<SectorMapNode[]> {
  const symbols = await getTrackedSymbols();
  if (symbols.length === 0) return [];

  const supabase = await createClient();
  const [{ data: prices }, { data: fundamentals }] = await Promise.all([
    supabase
      .from("historical_prices")
      .select("symbol, ts, close")
      .in("symbol", symbols)
      .order("ts", { ascending: false })
      .limit(symbols.length * 2),
    supabase.from("fundamentals").select("symbol, sector, shares_outstanding").in("symbol", symbols),
  ]);

  const fundamentalsBySymbol = new Map((fundamentals ?? []).map((f) => [f.symbol, f]));
  const closesBySymbol = new Map<string, number[]>();
  for (const p of prices ?? []) {
    if (p.close === null) continue;
    const arr = closesBySymbol.get(p.symbol) ?? [];
    if (arr.length < 2) arr.push(p.close);
    closesBySymbol.set(p.symbol, arr);
  }

  const bySector = new Map<string, SectorMapNode["children"]>();
  for (const symbol of symbols) {
    const closes = closesBySymbol.get(symbol) ?? [];
    const price = closes[0] ?? null;
    const prev = closes[1] ?? null;
    const changePct = price !== null && prev !== null && prev !== 0 ? ((price - prev) / prev) * 100 : null;

    const f = fundamentalsBySymbol.get(symbol);
    const marketCap = price !== null && f?.shares_outstanding ? price * f.shares_outstanding : null;
    const sectorName = f?.sector ?? "Unclassified";

    const children = bySector.get(sectorName) ?? [];
    children.push({ name: symbol, size: marketCap ?? 1, changePct });
    bySector.set(sectorName, children);
  }

  return Array.from(bySector.entries()).map(([name, children]) => ({ name, children }));
}
