"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth";
import { fetchUsdRate } from "@/lib/market-data/fx";
import { DEFAULT_DISPLAY_PREFS, type DisplayPrefs } from "@/lib/display-prefs";

/**
 * Resolve the Display settings for the signed-in user, including the FX rate
 * their chosen currency actually needs.
 *
 * Called once in the app layout and handed down through DisplayPrefsProvider,
 * so the rate is fetched once per navigation rather than per component. An
 * unauthenticated caller, a missing settings row, or an unavailable rate all
 * degrade to the documented defaults rather than throwing - a display
 * preference must never be able to take a page down.
 */
export async function getDisplayPrefs(): Promise<DisplayPrefs> {
  const user = await getAuthUser();
  if (!user) return DEFAULT_DISPLAY_PREFS;

  const supabase = await createClient();
  const { data } = await supabase
    .from("user_settings")
    .select("currency, metric_style, compact_mode, extended_hours, default_chart_view")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!data) return DEFAULT_DISPLAY_PREFS;

  const currency = data.currency || "USD";
  const fx = await fetchUsdRate(currency);

  return {
    currency,
    // No rate means the figures stay in dollars and the UI says so. The
    // alternative - printing "€" in front of an unconverted USD number - is a
    // wrong figure on a balance screen.
    effectiveCurrency: fx ? currency : "USD",
    fxRate: fx?.rate ?? 1,
    fxAsOf: currency !== "USD" ? (fx?.asOf ?? null) : null,
    fxSource: currency !== "USD" ? (fx?.source ?? null) : null,
    fxUnavailable: currency !== "USD" && fx === null,
    metricStyle: data.metric_style ?? "percent",
    compactMode: data.compact_mode ?? false,
    extendedHours: data.extended_hours ?? false,
    defaultChartView: data.default_chart_view ?? "1D",
  };
}
