"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EMPTY_FILTERS, type SavedScreen, type ScreenerFilters, type ScreenerRow } from "@/lib/screener";

// Market cap, P/E, and dividend yield are derived here from SEC XBRL
// fundamentals (shares outstanding, TTM EPS, TTM dividends) against the latest
// close - never stored, so they can't go stale as prices move. A symbol with no
// fundamentals row (ETFs, funds - anything that doesn't file these XBRL
// concepts) keeps null for all three and is excluded by those filters rather
// than being given a fabricated value.
export async function runScreen(rawFilters: ScreenerFilters): Promise<ScreenerRow[]> {
  // Screens saved before the fundamentals fields existed have `undefined` for
  // them, and `undefined !== null` - so coalesce before any comparison.
  const filters: ScreenerFilters = { ...EMPTY_FILTERS, ...rawFilters };
  const supabase = await createClient();

  // Two most recent closes per symbol give price + day change; volume comes
  // from the latest bar.
  const [{ data: prices }, { data: fundamentals }] = await Promise.all([
    supabase
      .from("historical_prices")
      .select("symbol, asset_type, ts, close, volume")
      .order("ts", { ascending: false })
      .limit(2000),
    supabase.from("fundamentals").select("symbol, shares_outstanding, eps_ttm, dividends_ttm"),
  ]);

  const fundamentalsBySymbol = new Map((fundamentals ?? []).map((f) => [f.symbol, f]));

  const bySymbol = new Map<string, { assetType: string; closes: number[]; volume: number | null }>();
  for (const p of prices ?? []) {
    const entry = bySymbol.get(p.symbol) ?? { assetType: p.asset_type, closes: [], volume: null };
    // rows are ordered ts desc, so closes accumulates most-recent-first; the
    // first 2 drive price/changePct, up to 12 feed the Trend sparkline.
    if (entry.closes.length < 12 && p.close !== null) {
      if (entry.closes.length === 0) entry.volume = p.volume;
      entry.closes.push(Number(p.close));
    }
    bySymbol.set(p.symbol, entry);
  }

  const rows: ScreenerRow[] = Array.from(bySymbol.entries()).map(([symbol, e]) => {
    const price = e.closes[0] ?? null;
    const prev = e.closes[1] ?? null;
    const f = fundamentalsBySymbol.get(symbol);

    return {
      symbol,
      assetType: e.assetType,
      price,
      changePct: price !== null && prev !== null && prev !== 0 ? ((price - prev) / prev) * 100 : null,
      volume: e.volume,
      trend: [...e.closes].reverse(),
      marketCap: price !== null && f?.shares_outstanding ? price * f.shares_outstanding : null,
      // A negative or zero TTM EPS has no meaningful P/E - leave it null rather
      // than reporting a negative multiple that would sort nonsensically.
      pe: price !== null && f?.eps_ttm && f.eps_ttm > 0 ? price / f.eps_ttm : null,
      dividendYield: price !== null && price > 0 && f?.dividends_ttm ? (f.dividends_ttm / price) * 100 : null,
    };
  });

  return rows
    .filter((r) => {
      if (filters.assetTypes.length > 0 && !filters.assetTypes.includes(r.assetType)) return false;
      if (filters.minPrice !== null && (r.price === null || r.price < filters.minPrice)) return false;
      if (filters.maxPrice !== null && (r.price === null || r.price > filters.maxPrice)) return false;
      if (filters.minChangePct !== null && (r.changePct === null || r.changePct < filters.minChangePct)) return false;
      if (filters.maxChangePct !== null && (r.changePct === null || r.changePct > filters.maxChangePct)) return false;
      if (filters.minVolume !== null && (r.volume === null || r.volume < filters.minVolume)) return false;

      const capM = r.marketCap === null ? null : r.marketCap / 1e6;
      if (filters.minMarketCapM !== null && (capM === null || capM < filters.minMarketCapM)) return false;
      if (filters.maxMarketCapM !== null && (capM === null || capM > filters.maxMarketCapM)) return false;
      if (filters.minPe !== null && (r.pe === null || r.pe < filters.minPe)) return false;
      if (filters.maxPe !== null && (r.pe === null || r.pe > filters.maxPe)) return false;
      if (
        filters.minDividendYield !== null &&
        (r.dividendYield === null || r.dividendYield < filters.minDividendYield)
      ) {
        return false;
      }
      return true;
    })
    .sort((a, b) => (b.changePct ?? -Infinity) - (a.changePct ?? -Infinity));
}

export async function listSavedScreens(): Promise<SavedScreen[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("saved_screens")
    .select("id, name, filters")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    filters: s.filters as unknown as ScreenerFilters,
  }));
}

export async function saveScreen(name: string, filters: ScreenerFilters) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.from("saved_screens").insert({
    user_id: user.id,
    name,
    filters: filters as unknown as Record<string, unknown>,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/screener");
}

export async function deleteSavedScreen(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase.from("saved_screens").delete().eq("id", id).eq("user_id", user.id);
  revalidatePath("/screener");
}
