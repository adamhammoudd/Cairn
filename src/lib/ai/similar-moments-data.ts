// Server glue for lib/ai/similar-moments.ts and lib/ai/direction.ts: read what
// the extra conditions need (results dates, filed quarters, the calendar),
// narrow the factor-derived cases, and compute the directional history.
// Reads only - it never writes, so a script can measure with it safely.
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { FactorAnalogResult, FactorInstance, FactorSet } from "@/lib/ai/factors";
import { directionalHistory, type DirectionalHistory } from "@/lib/ai/direction";
import {
  applyConditions,
  CONDITION_LABELS,
  EARNINGS_WINDOW_SESSIONS,
  earningsWithinSessions,
  todayConditionStates,
  trendLevelSeries,
  valuationLevelAt,
  type ConditionReport,
  type ConditionSpec,
  type ExtraConditionKey,
} from "@/lib/ai/similar-moments";
import { sortQuarters, type PricePoint, type Quarter } from "@/lib/fundamentals";
import type { Scorecard } from "@/lib/scorecard";

/**
 * The extra conditions the engine applies, in this order. Decided by the
 * measurement in scripts/measure-similar-moments.ts (2026-09-26) against the
 * rule in docs/decisions/2026-09-27-analysis-rebuild.md:
 *
 *   earnings_window  kept: MSFT 49 -> 41 cases, ISRG 46 -> 39.
 *   trend_level      kept: MSFT 49 -> 21, BTC 61 -> 60, META 24 -> 21, ISRG 46 -> 5.
 *   valuation_level  DROPPED. Measurable on MSFT only of NVDA/MSFT/BTC (49 -> 15);
 *                    ISRG 46 -> 2. About 40% of past cases have no state at all
 *                    (too few filed quarters for a 5-year average), so it could
 *                    only ever match recent years; stacked after the other two it
 *                    left MSFT with 6. valuationLevelAt stays, tested, for a later
 *                    look once more filing history is stored.
 */
export const ENGINE_CONDITIONS: ExtraConditionKey[] = ["earnings_window", "trend_level"];

export interface SimilarMoments {
  history: DirectionalHistory;
  /** The factor states the base cases were matched on (today's price state). */
  factorConditions: { key: string; state: string; label: string }[];
  /** Base cases before any extra condition. */
  baseCount: number;
  /** The cases the history was counted from (after the extra conditions). */
  cases: FactorInstance[];
  conditions: ConditionReport[];
}

export interface ConditionData {
  releaseDates: string[];
  quarters: Quarter[];
  annualEps: Map<number, number>;
  pricesAsc: PricePoint[];
  upcomingEarnings: string[];
}

export async function loadConditionData(supabase: SupabaseClient<Database>, symbol: string, today: string, pricesAsc: PricePoint[]): Promise<ConditionData> {
  const [rel, q, a, cal] = await Promise.all([
    supabase.from("earnings_releases").select("release_date").eq("symbol", symbol).order("release_date", { ascending: false }).limit(200),
    // Service-role only since migration 0053; read here, never passed on.
    createAdminClient().from("company_financials_quarterly").select("*").eq("symbol", symbol).order("period_end", { ascending: false }).limit(60),
    createAdminClient().from("company_financials_annual").select("fiscal_year, eps_diluted").eq("symbol", symbol),
    supabase.from("calendar_events").select("event_date").eq("symbol", symbol).eq("event_type", "earnings").gte("event_date", today).order("event_date").limit(3),
  ]);
  for (const r of [rel, q, a, cal]) if (r.error) throw new Error(`Failed to read condition data for ${symbol}: ${r.error.message}`);
  const annualEps = new Map<number, number>();
  for (const row of a.data ?? []) if (row.eps_diluted !== null) annualEps.set(row.fiscal_year, Number(row.eps_diluted));
  return {
    releaseDates: (rel.data ?? []).map((r) => String(r.release_date)),
    quarters: sortQuarters((q.data ?? []) as unknown as Quarter[]),
    annualEps,
    pricesAsc,
    upcomingEarnings: (cal.data ?? []).map((r) => String(r.event_date)),
  };
}

/**
 * Specs for the conditions in `keys`, with each case's state computed from
 * data that existed on its date. Exported for the measurement script, which
 * applies them one at a time.
 */
export function conditionSpecs(args: {
  set: FactorSet;
  assetType: string | null;
  scorecard: Scorecard;
  data: ConditionData;
  today: string;
  keys: ExtraConditionKey[];
}): ConditionSpec<FactorInstance>[] {
  const { set, data } = args;
  const trendDim = args.scorecard.dimensions.find((d) => d.key === "trend");
  const valuationDim = args.scorecard.dimensions.find((d) => d.key === "valuation");
  const levels = trendLevelSeries(set.bars.map((b) => b.close), set.periodsPerYear);
  const trendToday = trendDim && trendDim.level !== "not_applicable" ? (trendDim.verdict as "Rising" | "Sideways" | "Falling") : null;
  const states = todayConditionStates({
    assetType: args.assetType,
    today: args.today,
    upcomingEarnings: data.upcomingEarnings,
    trendLevel: trendToday,
    valuationVerdict: valuationDim?.verdict ?? null,
  });
  // No results history stored means no way to say which past moments had
  // results coming up: the condition has no state, rather than "never".
  if (states.earnings_window.applies && data.releaseDates.length === 0) states.earnings_window.today = null;

  const all: Record<ExtraConditionKey, ConditionSpec<FactorInstance>> = {
    earnings_window: {
      key: "earnings_window",
      label: CONDITION_LABELS.earnings_window,
      applies: states.earnings_window.applies,
      today: states.earnings_window.today,
      stateOf: (c) => (earningsWithinSessions(set.bars, c.index, data.releaseDates, EARNINGS_WINDOW_SESSIONS) ? "within" : "not_within"),
    },
    trend_level: {
      key: "trend_level",
      label: CONDITION_LABELS.trend_level,
      applies: states.trend_level.applies,
      today: states.trend_level.today,
      stateOf: (c) => levels[c.index],
    },
    valuation_level: {
      key: "valuation_level",
      label: CONDITION_LABELS.valuation_level,
      applies: states.valuation_level.applies,
      today: states.valuation_level.today,
      stateOf: (c) => valuationLevelAt(c.date, data.quarters, data.pricesAsc, data.annualEps),
    },
  };
  return args.keys.map((k) => all[k]);
}

/** The directional history for today's analysis, or null when the factor scan found no usable set. */
export function similarMoments(args: {
  set: FactorSet;
  result: FactorAnalogResult;
  assetType: string | null;
  scorecard: Scorecard;
  data: ConditionData;
  today: string;
  keys?: ExtraConditionKey[];
}): SimilarMoments | null {
  if (!args.result.ok) return null;
  const { analogs } = args.result;
  const specs = conditionSpecs({ ...args, keys: args.keys ?? ENGINE_CONDITIONS });
  const { cases, report } = applyConditions(analogs.instances, specs);
  return {
    history: directionalHistory(
      cases.map((c) => ({ date: c.date, dateAfter: c.dateAfter, priceBefore: c.priceBefore, priceAfter: c.priceAfter })),
      analogs.horizonSessions,
    ),
    factorConditions: analogs.conditions.map((c) => ({ key: c.key, state: c.state, label: c.label })),
    baseCount: analogs.instances.length,
    cases,
    conditions: report,
  };
}
