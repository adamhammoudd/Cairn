"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { SavedScreen, ScreenerFilters, ScreenerRow } from "@/lib/screener";

// NOTE (scope): market cap, P/E, and dividend yield are in the Phase 7 spec but
// have no source in the schema — Phase 2 ingests OHLCV bars only, no fundamentals
// provider. Adding those filters means adding a fundamentals provider + table
// first; screening on fabricated values would be worse than not offering them.
// Everything below filters real ingested data.
export async function runScreen(filters: ScreenerFilters): Promise<ScreenerRow[]> {
  const supabase = await createClient();

  // Two most recent closes per symbol give price + day change; volume comes
  // from the latest bar.
  const { data: prices } = await supabase
    .from("historical_prices")
    .select("symbol, asset_type, ts, close, volume")
    .order("ts", { ascending: false })
    .limit(2000);

  const bySymbol = new Map<string, { assetType: string; closes: number[]; volume: number | null }>();
  for (const p of prices ?? []) {
    const entry = bySymbol.get(p.symbol) ?? { assetType: p.asset_type, closes: [], volume: null };
    if (entry.closes.length < 2 && p.close !== null) {
      if (entry.closes.length === 0) entry.volume = p.volume;
      entry.closes.push(p.close);
    }
    bySymbol.set(p.symbol, entry);
  }

  const rows: ScreenerRow[] = Array.from(bySymbol.entries()).map(([symbol, e]) => {
    const price = e.closes[0] ?? null;
    const prev = e.closes[1] ?? null;
    return {
      symbol,
      assetType: e.assetType,
      price,
      changePct: price !== null && prev !== null && prev !== 0 ? ((price - prev) / prev) * 100 : null,
      volume: e.volume,
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
