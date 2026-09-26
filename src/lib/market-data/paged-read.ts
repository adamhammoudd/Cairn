import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { MIGRATIONS, unwrapRows } from "@/lib/supabase/read";
import type { PriceBar } from "@/lib/portfolio";
import { readNewestFirstPaged } from "../../../supabase/functions/_shared/paged-read";

// readNewestFirstPaged lives in supabase/functions/_shared so the Deno edge
// functions (evaluate-alerts) page the same way the app does.
export { API_MAX_ROWS, readNewestFirstPaged } from "../../../supabase/functions/_shared/paged-read";

/**
 * recent_prices(symbols, perSymbol) read in full, however many rows that is.
 * One call returns at most 1000 rows, and recent_prices returns symbol by
 * symbol, so four holdings x 1500 bars (5,267 rows on 2026-09-26) came back
 * as NVDA alone and the Portfolio chart plotted 1 of 4 positions. Pages are
 * taken over an explicit order so they join without gaps or repeats. A failed
 * page throws a DataReadError, like every other read on these pages: a
 * partial history must never be drawn as the whole one.
 */
export async function readRecentPrices(
  supabase: SupabaseClient<Database>,
  symbols: string[],
  perSymbol: number,
): Promise<PriceBar[]> {
  if (symbols.length === 0) return [];
  // recent_prices caps per_symbol at 2000 itself.
  const max = symbols.length * Math.max(1, Math.min(perSymbol, 2000));
  return readNewestFirstPaged(async (from, to) => {
    const res = await supabase
      .rpc("recent_prices", { symbols, per_symbol: perSymbol })
      .order("symbol")
      .order("asset_type")
      .order("ts", { ascending: false })
      .range(from, to);
    return { data: unwrapRows("Price history (recent_prices)", res, MIGRATIONS.onDemandIngestion) as PriceBar[], error: null };
  }, max);
}
