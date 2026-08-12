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

// ---------------------------------------------------------------------------
// Deterministic probability band.
//
// Previously the model chose probability_low/probability_high itself. That was
// always the weakest link in the engine (a language model is not a calibrated
// estimator), and it is untenable with a small self-hosted model. So the band
// is now computed here, in code, from the actual distribution of historical
// analog outcomes -- the model never picks a number.
//
// The band is a Wilson score interval on the observed base rate. Wilson rather
// than the textbook normal approximation because it stays inside [0,1] and
// behaves sensibly at the small sample sizes this engine actually sees (a
// ticker with 4 past earnings analogs). Its key property is exactly the
// behavior the product requires: the interval widens automatically as the
// sample shrinks, so "honest uncertainty" is a mathematical consequence of
// the data rather than something a model self-reports.
// ---------------------------------------------------------------------------

/** Move magnitude, in percent, at or above which an analog counts as an "elevated" move. */
export const ELEVATED_MOVE_THRESHOLD_PCT = 5;

const Z_95 = 1.96;

export interface ProbabilityBand {
  /** Observed base rate in the analog sample, 0-100. */
  pointEstimate: number;
  low: number;
  high: number;
  confidence: "low" | "medium" | "high";
  sampleCount: number;
  /** How many analogs in the sample cleared the threshold. */
  hitCount: number;
}

export function wilsonInterval(hits: number, n: number, z: number = Z_95): { low: number; high: number } {
  if (n === 0) return { low: 0, high: 1 };
  const p = hits / n;
  const denominator = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denominator;
  const margin = (z / denominator) * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return { low: Math.max(0, center - margin), high: Math.min(1, center + margin) };
}

/**
 * Probability that this scope sees an elevated move, derived from how often
 * its historical analogs actually did. Confidence is graded on both sample
 * size and the resulting interval width -- a wide interval is never reported
 * as high confidence no matter how many analogs produced it.
 */
export function computeProbabilityBand(
  events: HistoricalEventLike[],
  thresholdPct: number = ELEVATED_MOVE_THRESHOLD_PCT,
): ProbabilityBand {
  const moves = events
    .filter((e): e is HistoricalEventLike & { price_before: number; price_after: number } =>
      e.price_before !== null && e.price_after !== null && e.price_before !== 0,
    )
    .map((e) => Math.abs(pctMove(e.price_before, e.price_after)));

  const n = moves.length;
  const hits = moves.filter((m) => m >= thresholdPct).length;

  if (n === 0) {
    return { pointEstimate: 0, low: 0, high: 100, confidence: "low", sampleCount: 0, hitCount: 0 };
  }

  const { low, high } = wilsonInterval(hits, n);
  const widthPct = (high - low) * 100;

  // Both conditions must hold -- a large sample that still yields a wide
  // interval stays "medium", and any sample under 5 analogs is always "low"
  // regardless of how tight the interval looks.
  let confidence: "low" | "medium" | "high";
  if (n < 5 || widthPct > 50) confidence = "low";
  else if (n < 15 || widthPct > 30) confidence = "medium";
  else confidence = "high";

  return {
    pointEstimate: Math.round((hits / n) * 100),
    low: Math.round(low * 100),
    high: Math.round(high * 100),
    confidence,
    sampleCount: n,
    hitCount: hits,
  };
}
