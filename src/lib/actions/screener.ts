"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { cryptoRolling24hFor } from "@/lib/market-data/current-price";
import { EMPTY_FILTERS, type SavedScreen, type ScreenerFilters, type ScreenerRow } from "@/lib/screener";
import { MIGRATIONS, unwrapRows } from "@/lib/supabase/read";

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

  // Twelve most recent closes per symbol: the first 2 drive price/changePct,
  // all 12 feed the Trend sparkline.
  //
  // This was one `order by ts desc limit 2000` across every symbol at once.
  // Because the rows interleave by date, the per-symbol depth was really
  // 2000/N - fine at 33 symbols, three bars each at 600, and zero for a symbol
  // whose last ingest is older than the newest 2000 rows. On-demand ingestion
  // makes N unbounded, so the budget has to be per symbol: recent_prices_all()
  // applies the LIMIT inside a lateral join.
  const [pricesRes, fundamentalsRes, directoryRes, rangesRes] = await Promise.all([
    supabase.rpc("recent_prices_all", { per_symbol: 12 }),
    supabase.from("fundamentals").select("symbol, shares_outstanding, eps_ttm, dividends_ttm"),
    supabase.from("symbol_directory").select("symbol, asset_type, name").eq("status", "available"),
    // Aggregated at the database - see symbol_52w_range() in migration 0028.
    // The 12 bars above are a fortnight; a 52-week screen needs 52 weeks.
    supabase.rpc("symbol_52w_range"),
  ]);

  // These four are what Markets and the Screener are made of. Every one of them
  // used to be `?? []`, so a database missing 0027/0028 produced an empty table
  // that was indistinguishable from "no symbols match your filters".
  const prices = unwrapRows("Screener prices (recent_prices_all)", pricesRes, MIGRATIONS.onDemandIngestion);
  const fundamentals = unwrapRows("Screener fundamentals", fundamentalsRes);
  const directory = unwrapRows("Screener symbol list (symbol_directory)", directoryRes, MIGRATIONS.onDemandIngestion);
  const ranges = unwrapRows("Screener 52-week ranges (symbol_52w_range)", rangesRes, MIGRATIONS.profilesStatements);

  const fundamentalsBySymbol = new Map(fundamentals.map((f) => [f.symbol, f]));
  const directoryBySymbol = new Map(directory.map((d) => [d.symbol, d]));
  const rangeBySymbol = new Map(
    (ranges as { symbol: string; week52_high: number | null; week52_low: number | null }[]).map((r) => [r.symbol, r]),
  );

  const bySymbol = new Map<string, { assetType: string; closes: number[]; volume: number | null; asOf: string | null }>();
  for (const p of prices as { symbol: string; asset_type: string; ts: string; close: number | null; volume: number | null }[]) {
    const entry = bySymbol.get(p.symbol) ?? { assetType: p.asset_type, closes: [], volume: null, asOf: null };
    // newest-first within a symbol
    if (entry.closes.length < 12 && p.close !== null) {
      if (entry.closes.length === 0) {
        entry.volume = p.volume;
        entry.asOf = p.ts;
      }
      entry.closes.push(Number(p.close));
    }
    bySymbol.set(p.symbol, entry);
  }

  // Crypto's headline 24h change is CoinGecko's rolling figure everywhere in
  // the app; a close-to-close delta on a market that never closes is an
  // arbitrary midnight slice, and showing one here and the other on the ticker
  // page is how BTC came to read +5.70% on Markets and -0.15% on its own page.
  const cryptoSymbols = Array.from(bySymbol.entries())
    .filter(([, e]) => e.assetType === "crypto")
    .map(([symbol]) => symbol);
  const rolling = await cryptoRolling24hFor(cryptoSymbols);

  const rows: ScreenerRow[] = Array.from(bySymbol.entries()).map(([symbol, e]) => {
    const price = e.closes[0] ?? null;
    const prev = e.closes[1] ?? null;
    const f = fundamentalsBySymbol.get(symbol);
    const closeToClose = price !== null && prev !== null && prev !== 0 ? ((price - prev) / prev) * 100 : null;

    return {
      symbol,
      assetType: directoryBySymbol.get(symbol)?.asset_type ?? e.assetType,
      name: directoryBySymbol.get(symbol)?.name ?? null,
      price,
      changePct: rolling.get(symbol) ?? closeToClose,
      volume: e.volume,
      asOf: e.asOf,
      trend: [...e.closes].reverse(),
      marketCap: price !== null && f?.shares_outstanding ? price * f.shares_outstanding : null,
      // A negative or zero TTM EPS has no meaningful P/E - leave it null rather
      // than reporting a negative multiple that would sort nonsensically.
      pe: price !== null && f?.eps_ttm && f.eps_ttm > 0 ? price / f.eps_ttm : null,
      dividendYield: price !== null && price > 0 && f?.dividends_ttm ? (f.dividends_ttm / price) * 100 : null,
      week52High: rangeBySymbol.get(symbol)?.week52_high === undefined || rangeBySymbol.get(symbol)?.week52_high === null
        ? null
        : Number(rangeBySymbol.get(symbol)!.week52_high),
      week52Low: rangeBySymbol.get(symbol)?.week52_low === undefined || rangeBySymbol.get(symbol)?.week52_low === null
        ? null
        : Number(rangeBySymbol.get(symbol)!.week52_low),
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
