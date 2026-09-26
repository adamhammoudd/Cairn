import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { MIGRATIONS, unwrapRows } from "@/lib/supabase/read";
import type { PriceBar } from "@/lib/portfolio";

// Newest-first reads that can be longer than one API response.
//
// Supabase's API returns at most 1000 rows per request, whatever `.limit()`
// asks for (live-confirmed in PR #132: "206, Content-Range 0-999/4435"). A
// read that needs more - the ticker chart's full history is up to 2000 bars,
// and 17 symbols already store over 1000 - has to page, or its oldest part is
// cut off without any error.

/** Rows per response the API will return. */
export const API_MAX_ROWS = 1000;

type PageResult<T> = { data: T[] | null; error: { message: string } | null };

/**
 * Read up to `max` rows by calling `fetchPage(from, to)` (inclusive range, as
 * `.range()` takes it) in API_MAX_ROWS pages. `fetchPage` must order
 * newest-first so the pages join without gaps; the result stays newest-first.
 * A failed page throws - a short history presented as the whole one is the
 * bug this exists to prevent.
 */
export async function readNewestFirstPaged<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  max: number,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < max; from += API_MAX_ROWS) {
    const to = Math.min(from + API_MAX_ROWS, max) - 1;
    const { data, error } = await fetchPage(from, to);
    if (error) throw new Error(`Paged price read failed at rows ${from}-${to}: ${error.message}`);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < to - from + 1) break;
  }
  return rows;
}

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
