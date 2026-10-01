// Loads the USD -> display-currency history that converts a cost at the rate on
// its purchase date (lib/fx-history.ts). Server only.
//
// One query per portfolio load: fx_usd_cross_series returns the whole span as a
// single jsonb value (migration 0065), from the last rate on or before the
// oldest purchase date to the newest one held. Never one query per holding, and
// not a row set that the API's 1000-row cap could truncate.
//
// A read that fails - the migration not applied yet, the table empty, a network
// error - does NOT fail the page. It returns the conversion with no history, so
// every holding's cost falls back to today's rate and the page says so
// (PortfolioTotals.costAtTodayRateCount). That is the honest degradation: the
// figure is labelled, never silently the old one and never an invented rate.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { DisplayPrefs } from "@/lib/display-prefs";
import type { CostFx } from "@/lib/fx-history";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Validate what the RPC returned: ascending [date, positive finite rate] pairs only. */
export function parseCrossSeries(raw: unknown): [string, number][] {
  if (!Array.isArray(raw)) return [];
  const out: [string, number][] = [];
  for (const row of raw) {
    if (!Array.isArray(row) || row.length !== 2) continue;
    const [d, r] = row;
    const rate = Number(r);
    if (typeof d === "string" && ISO_DATE.test(d) && Number.isFinite(rate) && rate > 0) out.push([d, rate]);
  }
  return out.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

/**
 * The conversion history for `prefs`' display currency, or null when nothing is
 * converted (a USD reader, or no rate could be sourced for today - the figures
 * are dollars then, and say so). `purchaseDates` bounds how far back to read.
 */
export async function loadCostFx(
  supabase: SupabaseClient<Database>,
  prefs: Pick<DisplayPrefs, "effectiveCurrency" | "fxRate" | "fxSource">,
  purchaseDates: (string | null | undefined)[],
): Promise<CostFx | null> {
  if (prefs.effectiveCurrency === "USD" || prefs.fxSource === null) return null;
  const valid = purchaseDates.filter((d): d is string => typeof d === "string" && ISO_DATE.test(d));
  const from = valid.length > 0 ? valid.reduce((a, b) => (a < b ? a : b)) : new Date().toISOString().slice(0, 10);
  const base = { currency: prefs.effectiveCurrency, today: prefs.fxRate };
  try {
    const { data, error } = await supabase.rpc("fx_usd_cross_series", { p_currency: prefs.effectiveCurrency, p_from: from });
    if (error) {
      console.error("[fx] historical rates unavailable:", error.message);
      return { ...base, points: [] };
    }
    return { ...base, points: parseCrossSeries(data) };
  } catch (err) {
    console.error("[fx] historical rates unreachable", err instanceof Error ? err.message : err);
    return { ...base, points: [] };
  }
}
