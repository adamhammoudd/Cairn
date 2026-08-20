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
      // The cap applies to the whole interleaved result, not per symbol, so
      // symbols.length * 2 only worked when every symbol had a bar on exactly
      // the same two dates. One missing day and a symbol got zero closes and
      // silently dropped to changePct = null. Six days of slack covers a long
      // weekend plus a stale feed.
      .limit(symbols.length * 6),
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

  // Named sectors first (largest by combined tile area), "Unclassified" last:
  // it is a coverage gap, not a sector, and shouldn't outrank real ones just
  // because it happens to hold the most symbols.
  return Array.from(bySector.entries())
    .map(([name, children]) => ({ name, children }))
    .sort((a, b) => {
      if (a.name === "Unclassified") return 1;
      if (b.name === "Unclassified") return -1;
      const size = (n: SectorMapNode) => n.children.reduce((sum, c) => sum + c.size, 0);
      return size(b) - size(a);
    });
}
