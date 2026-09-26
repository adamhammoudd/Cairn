// "What history says", in plain words.
//
// Takes the analog engine's own output - the past days a symbol was in the
// same price state as today (FactorAnalogSet instances, src/lib/ai/factors.ts)
// and the price 10 sessions later - and describes it: how many times, how
// many ended higher, the Wilson range (analytics.ts, unchanged) in tenths, and
// the engine's own confidence rule. Nothing here changes the engine's math;
// it only says what the engine found.
//
// Derived volatility-regime analogs (docs/decisions/2026-08-20-volatility-
// regime-as-analog.md, still open) are not part of this count: it uses only
// the factor-derived instances, which are labelled as "times it looked like
// this" in its own price history.

import { gradeConfidence, wilsonInterval } from "@/lib/ai/analytics";
import { MIN_FACTOR_ANALOG_SAMPLE } from "@/lib/ai/factors";

export interface HistoryInstance {
  date: string;
  priceBefore: number;
  priceAfter: number;
}

export interface ConditionRef {
  key: string;
  state: string;
}

export interface HistoryInput {
  name: string;
  assetType: string | null;
  horizonSessions: number;
  instances: HistoryInstance[];
  /** The conditions the analogs were matched on, to name them in the headline. */
  conditions?: ConditionRef[];
}

export interface HistoryPlain {
  status: "ok" | "too_few";
  /** "two weeks" / "10 days": how far ahead each case was measured, in words. */
  horizon: string;
  n: number;
  higher: number;
  notHigher: number;
  /** Wilson range on the share that ended higher, in tenths (0-10). */
  rateLow: number;
  rateHigh: number;
  confidence: "low" | "medium" | "high";
  headline: string;
  rangeSentence: string;
  confidenceSentence: string;
  /** One per case, oldest first. Drawn filled vs outlined, never colour alone. */
  dots: ("higher" | "not_higher")[];
  inputs: { label: string; value: number; display: string }[];
}

/** Plain names for factor states. No SMA, RSI, decile or standard deviations. */
const PLAIN_CONDITIONS: Record<string, string> = {
  "trend:uptrend": "a rising price trend",
  "trend:downtrend": "a falling price trend",
  "rsi14:overbought": "a fast run-up",
  "rsi14:oversold": "a sharp drop",
  "momentum_3m:strong": "unusually strong gains over three months",
  "momentum_3m:weak": "unusually weak three months",
  "volatility:elevated": "bigger swings than usual",
  "drawdown:deep": "a price well below its high for the year",
  "drawdown:at_high": "a new high for the year",
  "volume:spike": "unusually heavy trading",
  "mean_reversion:stretched_high": "a price well above its recent average",
  "mean_reversion:stretched_low": "a price well below its recent average",
  "relative_strength:leader": "doing much better than the market",
  "relative_strength:laggard": "doing much worse than the market",
};

export function plainConditions(conditions: ConditionRef[]): string {
  const words = conditions.map((c) => PLAIN_CONDITIONS[`${c.key}:${c.state}`]).filter((w): w is string => !!w);
  if (words.length <= 1) return words[0] ?? "";
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

export function tenthsWords(tenths: number): string {
  if (tenths <= 0) return "almost never";
  if (tenths >= 10) return "almost always";
  return `about ${tenths} in 10`;
}

const NUMBER_WORDS = ["", "one", "two", "three", "four", "five"];

/** 10 sessions = two weeks of trading; a coin trades daily, so 10 days. */
export function horizonWords(sessions: number, assetType: string | null): string {
  if (assetType === "crypto") return `${sessions} days`;
  if (sessions % 5 === 0 && sessions / 5 <= 5) return sessions === 5 ? "one week" : `${NUMBER_WORDS[sessions / 5]} weeks`;
  return `${sessions} trading days`;
}

export function historyInPlainWords(input: HistoryInput): HistoryPlain {
  const valid = input.instances
    .filter((i) => i.priceBefore > 0 && Number.isFinite(i.priceAfter))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const n = valid.length;
  const dots = valid.map((i) => (i.priceAfter > i.priceBefore ? "higher" : "not_higher") as "higher" | "not_higher");
  const higher = dots.filter((d) => d === "higher").length;
  const subject = input.assetType === "crypto" ? "the price" : "the share";
  const when = horizonWords(input.horizonSessions, input.assetType);

  if (n < MIN_FACTOR_ANALOG_SAMPLE) {
    const headline =
      n === 0
        ? `${input.name} hasn't looked like this before in the prices we store, so there is no history to go on.`
        : `${input.name} has looked like this only ${n} time${n === 1 ? "" : "s"} before, too few to say what usually follows.`;
    return {
      status: "too_few",
      horizon: when,
      n,
      higher,
      notHigher: n - higher,
      rateLow: 0,
      rateHigh: 10,
      confidence: "low",
      headline,
      rangeSentence: "",
      confidenceSentence: "Confidence: low.",
      dots,
      inputs: [{ label: "Similar past moments", value: n, display: String(n) }],
    };
  }

  const { low, high } = wilsonInterval(higher, n);
  const rateLow = Math.round(low * 10);
  const rateHigh = Math.round(high * 10);
  const confidence = gradeConfidence(n, low, high);
  const conditions = input.conditions ? plainConditions(input.conditions) : "";
  const like = conditions ? `looked like this (${conditions})` : "looked like this";
  const headline = `The last ${n} times ${input.name} ${like}, ${subject} was higher ${when} later ${higher} times.`;
  const rangeSentence = `That is a past pattern, not a promise. With ${n} cases, the true rate could be anywhere from ${tenthsWords(rateLow)} to ${tenthsWords(rateHigh).replace(/^about /, "")}.`;

  return {
    status: "ok",
    horizon: when,
    n,
    higher,
    notHigher: n - higher,
    rateLow,
    rateHigh,
    confidence,
    headline,
    rangeSentence,
    confidenceSentence: `Confidence: ${confidence}.`,
    dots,
    inputs: [
      { label: "Similar past moments", value: n, display: String(n) },
      { label: `Higher ${when} later`, value: higher, display: String(higher) },
      { label: "Lower or unchanged", value: n - higher, display: String(n - higher) },
      { label: "Likely range, low (in 10)", value: rateLow, display: String(rateLow) },
      { label: "Likely range, high (in 10)", value: rateHigh, display: String(rateHigh) },
      { label: "Out of", value: 10, display: "10" },
      { label: "Days measured ahead", value: input.horizonSessions, display: String(input.horizonSessions) },
    ],
  };
}
