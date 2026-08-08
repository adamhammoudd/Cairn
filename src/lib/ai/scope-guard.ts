// Hard technical gate, not a prompt instruction: every generated analysis
// passes through here before it's ever written to ai_analyses or shown to a
// user. Two independent layers:
//
// 1. Structural: the generator's input/output types never carry a user_id,
//    holding_id, or any portfolio reference (see ai/generate.ts) — a
//    personalized recommendation is architecturally impossible to *request*,
//    not just filtered after the fact.
// 2. Content: regex-based detection of personal-directive language in the
//    generated text, run against the actual output regardless of what the
//    model was instructed to do. A prompt can be ignored; this can't.
//
// This is a best-effort linguistic filter, not a proof — see the false-
// negative note below. It is deliberately over-inclusive (biased toward
// flagging borderline cases) since the cost of a false reject is low
// (regenerate) and the cost of a false accept is a compliance failure.

export interface ScopeGuardResult {
  passed: boolean;
  reason: string | null;
}

// "you should/could/might want to/need to <action>" — direct second-person advice
const SECOND_PERSON_DIRECTIVE =
  /\byou\s+(should|could|might want to|need to|ought to|may want to)\b[^.!?]{0,60}\b(buy|sell|hold|purchase|invest|add|trim|reduce|increase|exit|liquidate|short|close|rebalance)\b/i;

// "your position/portfolio/holding/shares/stake/account" — personalization reference,
// regardless of the verb around it
const PERSONAL_POSSESSION = /\byour\s+(position|portfolio|holding|holdings|shares|stake|account|investment)\b/i;

// "I recommend/suggest/advise (that) you ..."
const FIRST_PERSON_ADVICE = /\bi\s+(recommend|suggest|advise)\b/i;

// Bare imperative aimed at the reader: "Buy the dip here.", "Sell now."
// Scoped to sentence-start, with an exclusion list for the financial-jargon
// compounds that would otherwise false-positive here ("sell-side", "buy-side",
// "sell off risk assets", "hold rates steady" — all real, common, non-advice
// usages confirmed against hand-written test cases before this was settled on).
const IMPERATIVE_SENTENCE_START =
  /(^|[.!?]\s+)(buy|sell|hold)(?!-)\s+(?!(rates|steady|off|out|back|up|down|firm|flat|its|the line|pressure|signal|volume|orders?|rating|call|recommendation|side))/i;

const RULES: { pattern: RegExp; reason: string }[] = [
  { pattern: SECOND_PERSON_DIRECTIVE, reason: "second_person_directive" },
  { pattern: PERSONAL_POSSESSION, reason: "personal_possession_reference" },
  { pattern: FIRST_PERSON_ADVICE, reason: "first_person_advice" },
  { pattern: IMPERATIVE_SENTENCE_START, reason: "imperative_sentence" },
];

export function checkScopeGuard(text: string): ScopeGuardResult {
  for (const rule of RULES) {
    if (rule.pattern.test(text)) {
      return { passed: false, reason: rule.reason };
    }
  }
  return { passed: true, reason: null };
}

// Completeness gate — separate from the personal-directive check above.
// "Never a bare number" (Phase 4 spec): an analysis with no sources, no
// historical analogs, or no plain-language reasoning is rejected outright,
// independent of whether its text happens to pass the directive check.
export interface AnalysisCompleteness {
  reasoning_text: string;
  source_count: number;
  historical_analog_count: number;
  sample_size: number;
}

export function checkCompleteness(a: AnalysisCompleteness): ScopeGuardResult {
  if (!a.reasoning_text || a.reasoning_text.trim().length < 20) {
    return { passed: false, reason: "missing_or_too_short_reasoning" };
  }
  if (a.source_count < 1) {
    return { passed: false, reason: "no_sources_cited" };
  }
  if (a.historical_analog_count < 1) {
    return { passed: false, reason: "no_historical_analogs" };
  }
  if (a.sample_size < 1) {
    return { passed: false, reason: "zero_sample_size" };
  }
  return { passed: true, reason: null };
}
