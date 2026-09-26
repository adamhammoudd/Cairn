// Fixtures for analysis-display.ts (the suite) and render-analysis-view.ts (its
// child renderer): the same rows built into displays for each plan and asset.
import { buildAnalysisDisplay, type AnalysisRowLike, type CaseRow, type Plan } from "../../../src/lib/analysis-display";

const moves = [3, -2, 5, 1, -4, 2, 6, -1, 2, 3, -3, 4, 1, -2];
export const CASES: CaseRow[] = moves.map((m, i) => ({
  event_date: new Date(Date.UTC(2023, 0, 2) + i * 14 * 86_400_000).toISOString().slice(0, 10),
  price_before: 100,
  price_after: 100 + m,
  note: "Matched today's state.",
  date_after: new Date(Date.UTC(2023, 0, 16) + i * 14 * 86_400_000).toISOString().slice(0, 10),
  in_direction_set: true,
}));

const dim = (key: string, label: string, level: string, verdict: string, sentence: string) => ({ key, label, level, rated: key !== "next_event", verdict, sentence, inputs: [], sources: [] });
const STOCK_CARD = {
  symbol: "NVDA",
  asOf: "2026-09-25",
  dimensions: [
    dim("valuation", "Price vs profit", "strong", "Cheaper than usual", "The share costs 28 times the company's yearly profit."),
    dim("growth", "Growth", "strong", "Strong", "Sales are up 83% on last year."),
    dim("health", "Financial health", "strong", "Strong", "It has more cash than debt."),
    dim("dividend", "Dividend", "not_applicable", "Tiny", "Pays 0.12% a year."),
    dim("trend", "Price trend", "strong", "Rising", "Up 31% over 6 months."),
    dim("next_event", "Next event", "not_applicable", "Earnings in about 53 days (estimated)", "Earnings, around Wed 18 Nov."),
  ],
};
const na = (key: string, label: string) => dim(key, label, "not_applicable", "Not applicable", "There is no company behind it, so company figures don't apply.");
const COIN_CARD = { symbol: "BTC", asOf: "2026-09-26", dimensions: [na("valuation", "Price vs profit"), na("growth", "Growth"), na("health", "Financial health"), na("dividend", "Dividend"), dim("trend", "Price trend", "strong", "Rising", "Up 22% over 6 months."), dim("next_event", "Next event", "not_applicable", "None in calendar", "Cairn's calendar has no earnings or dividend dates for it in the next 60 days.")] };

const base = (over: Partial<AnalysisRowLike>): AnalysisRowLike => ({
  id: "a1",
  scope_type: "ticker",
  scope_value: "NVDA",
  analysis_type: "directional_history",
  created_at: "2026-09-26T12:00:00Z",
  confidence_level: "medium",
  sample_size: 24,
  probability_low: 9,
  probability_high: 40,
  reasoning_text: "NVIDIA is a fast-growing company.",
  plain_summary: { version: 1, scorecard: STOCK_CARD },
  headline: "NVIDIA is a fast-growing company whose share costs less than usual for its profit.",
  bullets: ["Sales are up 83% on last year.", "Up 31% over 6 months.", "Higher 2 weeks later in 9 of 14 similar moments."],
  watch: [{ text: "Results expected around Wed 18 Nov (estimated).", ref: "event:e1" }, { text: "Chip export rules, see Reuters, 24 Sep.", ref: "source:n1" }],
  sources_used: ["n1"],
  text_source: "model",
  direction_horizon_sessions: 10,
  direction_n: 14,
  direction_higher: 9,
  direction_up_low: 39,
  direction_up_high: 84,
  direction_confidence: "medium",
  direction_p25: -1.8,
  direction_median: 1.5,
  direction_p75: 3,
  direction_worst: -4,
  direction_best: 6,
  direction_conditions: { factor: [{ key: "trend", state: "uptrend" }], extra: [{ key: "trend_level", kept: true, today: "Rising" }] },
  ...over,
});

export const SOURCES = [{ id: "n1", title: "Chip export rules tighten again", source_name: "Reuters", url: "https://example.com/r", published_at: "2026-09-24T10:00:00Z" }];
const FACTORS = [{ factor_key: "rsi14", value: 55.2, percentile: 61, detail: { label: "RSI-14", state_label: null } }];

export function fixture(name: string) {
  const make = (row: AnalysisRowLike, plan: Plan, assetType: string | null, displayName: string, cases = CASES) =>
    buildAnalysisDisplay({ row, name: displayName, assetType, plan, cases, sources: SOURCES, factors: FACTORS });
  switch (name) {
    case "free-model":
      return make(base({}), "free", "equity", "NVIDIA");
    case "premium-model":
      return make(base({}), "premium", "equity", "NVIDIA");
    case "free-template":
      return make(base({ text_source: "template" }), "free", "equity", "NVIDIA");
    case "crypto":
      return make(
        base({ scope_value: "BTC", headline: "Bitcoin has no company behind it, so this covers its price record.", bullets: ["Up 22% over 6 months.", "Higher 10 days later in 9 of 14 similar moments.", "Confidence: medium, from only 14 cases."], plain_summary: { version: 1, scorecard: COIN_CARD }, watch: [] }),
        "free",
        "crypto",
        "Bitcoin",
      );
    case "etf":
      return make(
        base({ scope_value: "SPY", headline: "SPY is a fund holding many companies, so this covers its price record.", bullets: ["Up 20% over 6 months.", "SPY isn't in an unusual price state today, so there are no similar past moments to compare.", "Confidence: low. This is what happened before, not a forecast."], watch: [], direction_n: null, direction_higher: null, direction_p25: null, direction_median: null, direction_p75: null, direction_worst: null, direction_best: null, direction_conditions: null, plain_summary: { version: 1, scorecard: { ...COIN_CARD, symbol: "SPY" } } }),
        "free",
        "etf",
        "SPY",
        [],
      );
    case "legacy":
      return make(
        { id: "old", scope_type: "ticker", scope_value: "NVDA", analysis_type: "volatility_likelihood", created_at: "2026-09-25T00:00:00Z", confidence_level: "medium", sample_size: 24, probability_low: 9, probability_high: 40, reasoning_text: "NVDA saw elevated moves in 5 of 24 analogs. More detail follows.", plain_summary: null },
        "free",
        "equity",
        "NVIDIA",
        [],
      );
    default:
      throw new Error(`unknown fixture ${name}`);
  }
}
