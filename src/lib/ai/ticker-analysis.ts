// The pure half of a ticker analysis: turn the engine's result, the scorecard,
// the calendar and the news into the model's inputs (lib/ai/analysis-text.ts),
// and turn the result into the columns stored on ai_analyses (migration 0052).
// No database, no model; lib/ai/generate-ticker.ts does the reads and writes.

import type { ProbabilityBand } from "@/lib/ai/analytics";
import type { FactorAnalysis } from "@/lib/ai/factor-analysis";
import type { SimilarMoments } from "@/lib/ai/similar-moments-data";
import type { GeneratedText, TextEvent, TextInputs, TextNews } from "@/lib/ai/analysis-text";
import { plainConditions } from "@/lib/ai/history-plain";
import { EARNINGS_WINDOW_SESSIONS } from "@/lib/ai/similar-moments";
import { isEstimatedEvent } from "@/lib/calendar";
import { decodeEntities } from "@/lib/news";
import type { Scorecard } from "@/lib/scorecard";
import type { Database } from "@/lib/supabase/types";
import { noNewsLine, type DataSource } from "@/lib/ai/data-sources";

const SUFFIX = /,?\s+(?:inc\.?|incorporated|corporation|corp\.?|co\.?|company|ltd\.?|limited|plc|holdings?|n\.v\.|s\.a\.|ag|se|the)$/i;

/**
 * The name a reader would use in a sentence: "NVIDIA Corporation" -> "NVIDIA",
 * SEC's "COCA COLA CO" -> "Coca Cola". A fund goes by its symbol ("SPY"): its
 * full name ("State Street SPDR S&P 500 ETF Trust") is not what anyone says.
 */
export function plainName(name: string, symbol: string, assetType: string | null): string {
  if (assetType === "etf") return symbol;
  // SEC appends the state or country of incorporation: "Lifecore Biomedical,
  // INC. DE", "Bank OF Montreal /CAN/". Neither is part of the name.
  let n = name.trim().replace(/\s*\/[A-Z]{2,4}\/$/, "").replace(/(\b(?:inc|corp|co|ltd|plc)\.?)\s+[A-Z]{2}$/i, "$1");
  // Yahoo names coins by their quote pair ("Injective USD"); the coin is "Injective".
  if (assetType === "crypto") n = n.replace(/\s+USD$/i, "").trim();
  // Only a name written wholly in capitals (SEC's style) is softened; a brand
  // that is capitals by choice inside a normal name ("NVIDIA Corporation") is not.
  const secCapitals = !/[a-z]/.test(n);
  for (let i = 0; i < 3 && SUFFIX.test(n); i++) n = n.replace(SUFFIX, "").trim();
  if (secCapitals) n = n.replace(/\b[A-Z]{4,}\b/g, (w) => w.charAt(0) + w.slice(1).toLowerCase());
  return n || symbol;
}

/** "Yahoo Finance News (RSS)" -> "Yahoo Finance News". */
export function plainSource(source: string): string {
  return source.replace(/\s*\(RSS\)\s*$/i, "").trim();
}

/** 3-6 headlines: fewer is not a picture of the news, more is not read. */
export const MAX_TEXT_HEADLINES = 6;

/** Plain words for what the similar moments were matched on, deduplicated. */
export function matchedOnWords(sm: SimilarMoments | null): string[] {
  if (!sm || sm.kind !== "similar") return [];
  const words = sm.factorConditions.map((c) => plainConditions([{ key: c.key, state: c.state }])).filter(Boolean);
  for (const c of sm.conditions) {
    if (!c.kept || !c.today) continue;
    if (c.key === "earnings_window") words.push(c.today === "within" ? `results due within ${EARNINGS_WINDOW_SESSIONS} trading days` : `no results due within ${EARNINGS_WINDOW_SESSIONS} trading days`);
    if (c.key === "trend_level") words.push(`a ${c.today.toLowerCase()} price trend`);
  }
  return [...new Set(words)];
}

export interface CalendarRow {
  id: string;
  event_type: string;
  event_date: string;
  metadata: unknown;
}

export interface NewsRow {
  id: string;
  title: string;
  source_name: string;
  published_at: string;
}

export function textInputsFor(a: {
  name: string;
  symbol: string;
  assetType: string | null;
  factorAnalysis: FactorAnalysis | null;
  sm: SimilarMoments | null;
  scorecard: Scorecard;
  calendar: CalendarRow[];
  news: NewsRow[];
  band: ProbabilityBand;
  dataSources?: DataSource[];
}): TextInputs {
  const events: TextEvent[] = a.calendar
    .filter((e) => e.event_type === "earnings" || e.event_type === "ex_dividend" || e.event_type === "dividend")
    .slice(0, 3)
    .map((e, i) => ({
      id: `E${i + 1}`,
      rowId: e.id,
      kind: e.event_type === "earnings" ? "earnings" : e.event_type === "ex_dividend" ? "ex_dividend" : "dividend_payment",
      date: String(e.event_date).slice(0, 10),
      estimated: isEstimatedEvent(e.metadata),
    }));
  const news: TextNews[] = a.news.slice(0, MAX_TEXT_HEADLINES).map((n, i) => ({
    id: `N${i + 1}`,
    rowId: n.id,
    title: decodeEntities(n.title),
    source: plainSource(n.source_name),
    date: String(n.published_at),
  }));
  const readings = (a.factorAnalysis?.set.readings ?? [])
    .filter((r) => r.value !== null && (r.key === "rsi14" || r.key === "volatility" || r.key === "drawdown"))
    .map((r) => ({ label: r.label, display: String(r.value) }));
  const fa = a.factorAnalysis;
  return {
    name: plainName(a.name, a.symbol, a.assetType),
    // No tagged news: said plainly, computed in code, and the data cited instead.
    ...(a.news.length === 0 ? { noNews: noNewsLine(plainName(a.name, a.symbol, a.assetType), a.dataSources ?? []) } : {}),
    dataSources: (a.dataSources ?? []).map((d) => d.label),
    symbol: a.symbol,
    assetType: a.assetType,
    history: a.sm?.history ?? null,
    historyBasis: a.sm?.kind ?? "similar",
    ...(a.sm?.fallback ? { fallback: { matches: a.sm.fallback.matches } } : {}),
    ...(a.sm?.earnings ? { sessionsToRelease: a.sm.earnings.sessionsToRelease } : {}),
    noHistoryReason: a.sm ? null : !fa ? "no_price_history" : fa.result.ok ? null : fa.result.reason,
    matchedOn: matchedOnWords(a.sm),
    scorecard: a.scorecard,
    events,
    news,
    trader: {
      moveBandLow: a.band.low,
      moveBandHigh: a.band.high,
      moveBandPoint: a.band.pointEstimate,
      hitCount: a.band.hitCount,
      sampleCount: a.band.sampleCount,
      readings,
    },
  };
}

type Insert = Database["public"]["Tables"]["ai_analyses"]["Insert"];

/** The 0052 columns for one analysis. Free-tier content only: no per-case rows. */
export function directionColumns(sm: SimilarMoments | null, g: GeneratedText): Partial<Insert> {
  const h = sm?.history ?? null;
  return {
    direction_horizon_sessions: h?.horizonSessions ?? null,
    direction_n: h?.n ?? null,
    direction_higher: h?.higher ?? null,
    direction_up_low: h?.upRate.low ?? null,
    direction_up_high: h?.upRate.high ?? null,
    direction_confidence: h?.confidence ?? null,
    direction_p25: h?.typical?.p25 ?? null,
    direction_median: h?.typical?.median ?? null,
    direction_p75: h?.typical?.p75 ?? null,
    direction_worst: h?.worst ?? null,
    direction_best: h?.best ?? null,
    direction_conditions: sm
      ? ({
          basis: sm.kind,
          factor: sm.factorConditions,
          extra: sm.conditions,
          base_count: sm.baseCount,
          // Which fallback was used and why, so the display labels it (never mixed into one count).
          ...(sm.fallback ? { fallback: sm.fallback } : {}),
          ...(sm.earnings ? { earnings: { sessions_to_release: sm.earnings.sessionsToRelease, release_date: sm.earnings.releaseDate } } : {}),
        } as unknown as Record<string, unknown>)
      : null,
    headline: g.text.headline,
    bullets: g.text.bullets,
    watch: g.text.watch,
    sources_used: g.text.sources_used,
    text_source: g.source,
    // Reason codes only. The rejected drafts themselves go to the service-only
    // ai_scope_guard_log: this row is readable by every signed-in account.
    text_failures: g.attempts.map((x) => ({ reason: x.reason })),
  };
}
