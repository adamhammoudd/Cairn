// Deterministic calculations over historical_events, computed in code (not
// by the model) before the analysis prompt is built. This is what "perform
// calculations" means for the probability engine: real arithmetic on stored
// price_before/price_after data, fed to the model as grounding it must cite
// rather than invent -- and a real per-analog similarity_score instead of
// the previous hardcoded 1. Does not touch the scope-guard or completeness
// gates in lib/ai/scope-guard.ts.

interface HistoricalEventLike {
  id: string;
  event_type: string;
  event_date: string;
  price_before: number | null;
  price_after: number | null;
}

export interface HistoricalStats {
  sampleCount: number;
  avgMovePct: number | null;
  medianMovePct: number | null;
  positiveRatio: number | null;
}

function pctMove(before: number, after: number): number {
  return ((after - before) / before) * 100;
}

export function computeHistoricalStats(events: HistoricalEventLike[]): HistoricalStats {
  const moves = events
    .filter((e): e is HistoricalEventLike & { price_before: number; price_after: number } =>
      e.price_before !== null && e.price_after !== null && e.price_before !== 0,
    )
    .map((e) => pctMove(e.price_before, e.price_after));

  if (moves.length === 0) {
    return { sampleCount: 0, avgMovePct: null, medianMovePct: null, positiveRatio: null };
  }

  const sorted = [...moves].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  const avg = moves.reduce((sum, m) => sum + m, 0) / moves.length;
  const positiveRatio = moves.filter((m) => m > 0).length / moves.length;

  return { sampleCount: moves.length, avgMovePct: avg, medianMovePct: median, positiveRatio };
}

// Recency-weighted similarity in [0, 1] -- an analog from last quarter counts
// for more than one from five years ago. Simple exponential decay, one-year
// half-life; not a claim of statistical rigor, just a real, deterministic
// number instead of the previous "similarity_score: 1" placeholder for every
// analog regardless of age.
export function computeSimilarityScore(eventDate: string, asOf: Date = new Date()): number {
  const daysSince = Math.max(0, (asOf.getTime() - new Date(eventDate).getTime()) / 86_400_000);
  const halfLifeDays = 365;
  return Math.round(Math.pow(0.5, daysSince / halfLifeDays) * 1000) / 1000;
}
