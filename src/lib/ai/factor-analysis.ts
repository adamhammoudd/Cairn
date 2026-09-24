// Server-side glue for lib/ai/factors.ts: load a symbol's price history,
// persist its factor-derived analogs, and render the factor evidence as text
// for the prompt. The math itself stays in factors.ts so it can be tested with
// no database.

import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ELEVATED_MOVE_THRESHOLD_PCT } from "@/lib/ai/analytics";
import { ensureSymbolIngested } from "@/lib/market-data/ingest";
import {
  benchmarkSymbolFor,
  computeFactorSet,
  deriveFactorAnalogs,
  FACTOR_HISTORY_RANGE,
  TARGET_FACTOR_HISTORY_BARS,
  type FactorAnalogResult,
  type FactorAnalogSet,
  type FactorBar,
  type FactorSet,
} from "@/lib/ai/factors";

/**
 * Most bars to read. ~5 years of daily crypto sessions (365/yr) and well over
 * five years of equity ones, matching the FACTOR_HISTORY_RANGE the analysis
 * path ingests. Above PostgREST's 1000-row page, so loadBars pages explicitly
 * - taking the default page would silently analyse a truncated history.
 */
const MAX_BARS = 2000;

/** PostgREST's maximum rows per response. */
const PAGE = 1000;

export const FACTOR_EVENT_TYPE = "factor_signal";

/** A factor-derived analog shaped like a historical_events row, plus its link note. */
export interface FactorEventRow {
  id: string;
  symbol: string;
  sector: null;
  event_type: typeof FACTOR_EVENT_TYPE;
  event_date: string;
  description: string;
  price_before: number;
  price_after: number;
  volume_at_event: null;
  /** Written to ai_analysis_historical_analogs.note: which conditions matched and what followed. */
  note: string;
  /** Share of today's active conditions this analog matched, for the similarity score. */
  matchFraction: number;
}

export interface FactorAnalysis {
  set: FactorSet;
  benchmark: string | null;
  result: FactorAnalogResult;
  /** Present only when the analog scan cleared MIN_FACTOR_ANALOG_SAMPLE. */
  events: FactorEventRow[];
}

async function loadBars(supabase: SupabaseClient<Database>, symbol: string): Promise<FactorBar[]> {
  // Newest-first in pages of PAGE, then reversed once at the end, so the
  // caller always gets oldest-first regardless of how many pages it took.
  const rows: { ts: unknown; close: unknown; volume: unknown }[] = [];
  for (let offset = 0; offset < MAX_BARS; offset += PAGE) {
    const { data, error } = await supabase
      .from("historical_prices")
      .select("ts, close, volume")
      .eq("symbol", symbol)
      .not("close", "is", null)
      .order("ts", { ascending: false })
      .range(offset, Math.min(offset + PAGE, MAX_BARS) - 1);
    if (error) throw new Error(`Failed to read price history for ${symbol}: ${error.message}`);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE) break; // last page
  }
  return rows
    .map((r) => ({ date: String(r.ts).slice(0, 10), close: Number(r.close), volume: r.volume === null ? null : Number(r.volume) }))
    .reverse();
}

const fmtPct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

function noteFor(analogs: FactorAnalogSet, instanceIndex: number): string {
  const i = analogs.instances[instanceIndex];
  const matched = analogs.conditions.map((c) => c.label).join("; ");
  return `Matched today's state (${matched}). Close moved ${fmtPct(i.movePct)} over the next ${analogs.horizonSessions} sessions (${i.date} to ${i.dateAfter}).`;
}

/**
 * Compute the factor set and analog scan for a symbol. Returns null when the
 * symbol has too little price history for the factors to mean anything (the
 * caller then falls back to curated analogs, or reports thin data).
 */
export async function analyzeFactors(
  supabase: SupabaseClient<Database>,
  symbol: string,
  assetType: string | null,
): Promise<FactorAnalysis | null> {
  const bars = await loadBars(supabase, symbol);

  const benchmark = benchmarkSymbolFor(symbol, assetType);
  // The benchmark needs the same depth as the symbol, or relative strength is
  // computable over only the stretch they happen to share - SPY sat at ~2
  // years while a deepened ticker had ~5, so the reading was null for most of
  // its history and for today. Cached like any other symbol, and SPY/BTC are
  // hot, so this is one fetch amortised across every analysis.
  if (benchmark) {
    await ensureSymbolIngested(benchmark, { range: FACTOR_HISTORY_RANGE, minBars: TARGET_FACTOR_HISTORY_BARS });
  }
  const benchmarkBars = benchmark ? await loadBars(supabase, benchmark) : [];

  const set = computeFactorSet({
    symbol,
    assetType,
    bars,
    benchmark: benchmark && benchmarkBars.length > 0 ? { symbol: benchmark, bars: benchmarkBars } : null,
  });
  if (!set) return null;

  const result = deriveFactorAnalogs(set);
  if (!result.ok) return { set, benchmark, result, events: [] };

  const { analogs } = result;
  const matchFraction = analogs.conditions.length / (analogs.conditions.length + analogs.droppedConditions.length);

  // Instances are plain facts about a date (close then, close N sessions
  // later), so they are stored once as ordinary event rows and re-used by any
  // analysis that cites them. The unique (symbol, event_type, event_date)
  // index makes this idempotent; which conditions matched lives on the link's
  // note, never on the shared row.
  const admin = createAdminClient();
  const rows = analogs.instances.map((i) => ({
    symbol,
    sector: null,
    event_type: FACTOR_EVENT_TYPE,
    event_date: i.date,
    description: `Signal date in this symbol's own price history; outcome measured ${analogs.horizonSessions} sessions later.`,
    price_before: i.priceBefore,
    price_after: i.priceAfter,
    metadata: { source: "factor_scan", horizon_sessions: analogs.horizonSessions, date_after: i.dateAfter },
  }));

  const { error: upsertError } = await admin
    .from("historical_events")
    .upsert(rows, { onConflict: "symbol,event_type,event_date", ignoreDuplicates: false });
  if (upsertError) throw new Error(`Failed to store factor analogs: ${upsertError.message}`);

  const { data: stored, error: readError } = await admin
    .from("historical_events")
    .select("id, event_date")
    .eq("symbol", symbol)
    .eq("event_type", FACTOR_EVENT_TYPE)
    .in("event_date", analogs.instances.map((i) => i.date));
  if (readError) throw new Error(`Failed to read back factor analogs: ${readError.message}`);
  const idByDate = new Map((stored ?? []).map((r) => [String(r.event_date).slice(0, 10), r.id]));

  const events: FactorEventRow[] = [];
  analogs.instances.forEach((i, idx) => {
    const id = idByDate.get(i.date);
    if (!id) throw new Error(`Factor analog for ${symbol} on ${i.date} was not persisted.`);
    events.push({
      id,
      symbol,
      sector: null,
      event_type: FACTOR_EVENT_TYPE,
      event_date: i.date,
      description: rows[idx].description,
      price_before: i.priceBefore,
      price_after: i.priceAfter,
      volume_at_event: null,
      note: noteFor(analogs, idx),
      matchFraction,
    });
  });

  return { set, benchmark, result, events };
}

/**
 * The factor evidence as prompt text. Every figure is computed in code; the
 * model is told to describe them, never to restate them more precisely or add
 * its own.
 */
export function formatFactorBlock(analysis: FactorAnalysis, usedAnalogCount: number, hitCount: number): string {
  const lines = analysis.set.readings.map((r) => {
    const value = r.value === null ? "n/a" : String(r.value);
    const pct = r.percentile === null ? "" : `, ${r.percentile}th percentile of its own history`;
    const state = r.stateLabel ? ` - ${r.stateLabel}` : "";
    return `- ${r.label}: ${value}${pct}${state}`;
  });

  let analogLine: string;
  if (analysis.result.ok && usedAnalogCount > 0) {
    const a = analysis.result.analogs;
    analogLine =
      `Factor-derived analogs: ${a.instances.length} past occasions in this symbol's own price history when it was in the same state as today ` +
      `(${a.conditions.map((c) => c.label).join("; ")}). ` +
      `Each is measured ${a.horizonSessions} sessions forward; instances never overlap. ` +
      (a.droppedConditions.length > 0
        ? `Other active conditions (${a.droppedConditions.map((c) => c.label).join("; ")}) were not required, to keep the sample adequate. `
        : "") +
      `${hitCount} of ${usedAnalogCount} analogs in the combined set moved >=${ELEVATED_MOVE_THRESHOLD_PCT}%.`;
  } else if (!analysis.result.ok) {
    analogLine = "No factor-derived analog set was usable for this symbol (too few comparable past occasions).";
  } else {
    analogLine = "Factor-derived analogs were found but all overlapped curated events, so curated analogs stand alone.";
  }

  return `FACTOR READINGS (computed in code from this symbol's own daily price history, as of ${analysis.set.asOf};
benchmark for relative strength: ${analysis.benchmark ?? "none available"}):
${lines.join("\n")}
${analogLine}`;
}
