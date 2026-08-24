"use server";

import { createClient } from "@/lib/supabase/server";
import { getTrackedSymbols } from "@/lib/actions/comparison";
import type { SectorMapNode } from "@/lib/sector-map";

export async function getSectorHeatmap(): Promise<SectorMapNode[]> {
  const symbols = await getTrackedSymbols();
  if (symbols.length === 0) return [];

  const supabase = await createClient();
  const [{ data: prices }, { data: fundamentals }, { data: coinRows }] = await Promise.all([
    // Two bars per symbol, guaranteed per symbol. The shared-cap version
    // (`limit(symbols.length * 6)`) relied on every symbol printing bars on
    // the same days: one gap and a symbol got zero closes and silently became
    // a grey "-" tile. That is also unfixable by raising the multiplier once
    // the universe is on-demand.
    supabase.rpc("recent_prices", { symbols, per_symbol: 2 }),
    supabase.from("fundamentals").select("symbol, sector, shares_outstanding").in("symbol", symbols),
    supabase.from("crypto_metrics").select("symbol, price_change_24h_pct, market_cap").in("symbol", symbols),
  ]);

  const fundamentalsBySymbol = new Map((fundamentals ?? []).map((f) => [f.symbol, f]));
  const coinBySymbol = new Map((coinRows ?? []).map((c) => [c.symbol, c]));
  const closesBySymbol = new Map<string, number[]>();
  for (const p of (prices ?? []) as { symbol: string; ts: string; close: number | null }[]) {
    if (p.close === null) continue;
    const arr = closesBySymbol.get(p.symbol) ?? [];
    if (arr.length < 2) arr.push(Number(p.close));
    closesBySymbol.set(p.symbol, arr);
  }

  const bySector = new Map<string, SectorMapNode["children"]>();
  for (const symbol of symbols) {
    const closes = closesBySymbol.get(symbol) ?? [];
    const price = closes[0] ?? null;
    const prev = closes[1] ?? null;
    const coin = coinBySymbol.get(symbol);
    const closeToClose = price !== null && prev !== null && prev !== 0 ? ((price - prev) / prev) * 100 : null;
    // Same rule as every other surface: rolling 24h for coins, close-to-close
    // for session-based markets.
    const changePct = coin?.price_change_24h_pct != null ? Number(coin.price_change_24h_pct) : closeToClose;

    const f = fundamentalsBySymbol.get(symbol);
    const marketCap =
      coin?.market_cap != null
        ? Number(coin.market_cap)
        : price !== null && f?.shares_outstanding
          ? price * f.shares_outstanding
          : null;
    const sectorName = f?.sector ?? (coin ? "Digital assets" : "Unclassified");

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

/**
 * The sector names the map can actually show, for the Settings > Display >
 * "Sector map focus" dropdown.
 *
 * Read from the same fundamentals.sector column getSectorHeatmap() groups by,
 * plus the two names it synthesises, so the menu can never offer a focus the
 * map has no card for. Offering src/lib/sectors.ts's slugs here would have
 * looked richer and been wrong: those are the news tagger's vocabulary (GICS
 * -style), while the map groups by SEC SIC descriptions.
 */
export async function listSectorMapSectors(): Promise<string[]> {
  const symbols = await getTrackedSymbols();
  if (symbols.length === 0) return [];

  const supabase = await createClient();
  const [{ data: fundamentals }, { data: coinRows }] = await Promise.all([
    supabase.from("fundamentals").select("sector").in("symbol", symbols),
    supabase.from("crypto_metrics").select("symbol").in("symbol", symbols).limit(1),
  ]);

  const names = new Set<string>();
  for (const f of fundamentals ?? []) {
    if (f.sector) names.add(f.sector);
  }
  if ((coinRows ?? []).length > 0) names.add("Digital assets");

  return Array.from(names).sort((a, b) => a.localeCompare(b));
}
