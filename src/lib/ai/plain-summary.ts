// The plain-language summary on every ticker analysis: one headline and 3-4
// short bullets an everyday investor can read.
//
// The model is given ONLY the scorecard (src/lib/scorecard.ts), the "What
// history says" result (./history-plain.ts) and the upcoming events already
// inside the scorecard. It writes words, never figures: every number in its
// text must already be in those inputs.
//
// All guards run on the server and fail CLOSED. If any fails, the user sees a
// template built from the scorecard's own sentences, and the failure reason is
// stored with the analysis for review. The guards:
//   * structure: a headline (at most two sentences) and 3-4 bullets;
//   * addresses_reader: no "you"/"your" - it describes the ticker, never the
//     reader or their position;
//   * scope_guard: the same checkScopeGuard every analysis and chat turn
//     passes (no buy/hold/sell, no telling the reader what to do);
//   * freelanced_probability: checkNoFreelancedProbability with no allowed
//     ranges - the summary states no probabilities at all;
//   * number_not_in_inputs: every number, including spelled-out ones, must
//     appear in the inputs exactly as given (the approach of
//     checkPortfolioFigureDrift, extended to every number);
//   * unexplained_jargon: finance terms only with a plain explanation in
//     brackets right after them;
//   * sentence_too_long: at most 25 words (the target is under 20).

import { checkNoFreelancedProbability, checkScopeGuard } from "@/lib/ai/scope-guard";
import { NO_EVENT_VERDICT, VALUATION_VERDICTS, type Scorecard, type Dimension } from "@/lib/scorecard";
import type { HistoryPlain } from "@/lib/ai/history-plain";

export interface SummaryInputs {
  name: string;
  symbol: string;
  assetType: string | null;
  scorecard: Scorecard;
  history: HistoryPlain | null;
}

export interface SummaryText {
  headline: string;
  bullets: string[];
}

export type SummaryFailure =
  | "structure"
  | "addresses_reader"
  | "scope_guard"
  | "freelanced_probability"
  | "number_not_in_inputs"
  | "unexplained_jargon"
  | "sentence_too_long"
  | "model_error"
  | "model_unusable";

export interface PlainSummary extends SummaryText {
  source: "model" | "template";
  /** Why the model's text was not used; null when it was. */
  failure: SummaryFailure | null;
  evidence?: string;
  model?: string;
  generatedAt: string;
}

// ------------------------------------------------------------------ numbers

const NUMBER_WORDS: Record<string, string> = {
  zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
  eleven: "11", twelve: "12", thirteen: "13", fourteen: "14", fifteen: "15", sixteen: "16", seventeen: "17", eighteen: "18",
  nineteen: "19", twenty: "20", thirty: "30", forty: "40", fifty: "50", sixty: "60", seventy: "70", eighty: "80", ninety: "90",
  hundred: "100", twice: "2", double: "2", triple: "3", half: "50%",
};

const NUMBER_TOKEN = new RegExp(`[$€£]?\\d[\\d,]*(?:\\.\\d+)?%?|\\b(?:${Object.keys(NUMBER_WORDS).join("|")})\\b`, "gi");

/**
 * Every number in `text`, normalised for comparison: "$1,200" -> "1200",
 * "56%" stays "56%", "six" -> "6". A percentage and a bare number are
 * different tokens on purpose: "56%" in the inputs does not license "56".
 */
export function extractNumbers(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(NUMBER_TOKEN)) {
    const raw = m[0].toLowerCase();
    if (NUMBER_WORDS[raw]) out.push(NUMBER_WORDS[raw]);
    else out.push(raw.replace(/[$€£,]/g, ""));
  }
  return out;
}

function dimensionTexts(d: Dimension): string[] {
  return [d.verdict, d.sentence, ...d.inputs.map((i) => i.display ?? "")];
}

export function allowedNumbersFor(inputs: SummaryInputs): Set<string> {
  const texts: string[] = [inputs.name];
  for (const d of inputs.scorecard.dimensions) texts.push(...dimensionTexts(d));
  if (inputs.history) {
    texts.push(inputs.history.headline, inputs.history.rangeSentence, inputs.history.confidenceSentence);
    texts.push(...inputs.history.inputs.map((i) => i.display));
  }
  return new Set(texts.flatMap(extractNumbers));
}

// ------------------------------------------------------------------- jargon

/**
 * Finance terms a 12-year-old would not know. Allowed only when a plain
 * explanation in brackets follows right away, as the scorecard does:
 * "EBITDA (profit before interest, tax and write-downs)".
 */
const JARGON = [
  "EBITDA", "P/E", "PE ratio", "price[- ]to[- ]earnings", "EPS", "TTM", "YoY", "year[- ]over[- ]year", "free cash flow", "FCF",
  "payout ratio", "RSI", "SMA", "moving average", "volatility", "drawdown", "analogs?", "basis points", "bps", "multiples?",
  "margins?", "market cap(?:italization)?", "dividend yield", "yield", "beta", "momentum", "overbought", "oversold",
  "Wilson", "confidence interval", "standard deviations?", "percentile", "ex-dividend", "guidance", "consensus", "valuation",
  "leverage", "net debt", "liquidity",
];
const JARGON_RE = new RegExp(`\\b(?:${JARGON.join("|")})\\b`, "gi");

/**
 * The first unexplained jargon term in one bullet (or the headline). A term
 * explained once in a bullet may be repeated later in the same bullet:
 * "...as EBITDA (profit before interest, tax and write-downs). Its debt equals
 * 2.6 years of EBITDA." Each bullet must explain its own terms, because a
 * reader may read only that one.
 */
function unexplainedJargon(part: string): string | null {
  const explained = new Set<string>();
  for (const m of part.matchAll(JARGON_RE)) {
    const term = m[0].toLowerCase();
    const after = part.slice((m.index ?? 0) + m[0].length);
    if (/^\s*\(/.test(after)) {
      explained.add(term);
      continue;
    }
    if (explained.has(term)) continue;
    // Inside an explanation's own brackets is fine: "(profit before ... EBITDA)".
    const before = part.slice(0, m.index ?? 0);
    if ((before.match(/\(/g) ?? []).length > (before.match(/\)/g) ?? []).length) continue;
    return m[0];
  }
  return null;
}

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function wordCount(sentence: string): number {
  return sentence.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

export const MAX_SENTENCE_WORDS = 25;

// ------------------------------------------------------------------- checks

export interface CheckResult {
  passed: boolean;
  reason: SummaryFailure | null;
  evidence?: string;
}

export function checkSummaryText(s: SummaryText, inputs: SummaryInputs, opts: { minBullets?: number; maxBullets?: number } = {}): CheckResult {
  const minBullets = opts.minBullets ?? 3;
  const maxBullets = opts.maxBullets ?? 4;
  const fail = (reason: SummaryFailure, evidence?: string): CheckResult => ({ passed: false, reason, evidence });

  if (typeof s.headline !== "string" || !Array.isArray(s.bullets)) return fail("structure");
  const headline = s.headline.trim();
  const bullets = s.bullets.map((b) => (typeof b === "string" ? b.trim() : "")).filter(Boolean);
  if (!headline || sentences(headline).length > 2) return fail("structure", headline);
  if (bullets.length < minBullets || bullets.length > maxBullets) return fail("structure", `${bullets.length} bullets`);

  const parts = [headline, ...bullets];
  const all = parts.join(" ");

  for (const p of parts) {
    if (/\b(?:you|your|yours|you're|you'd|you'll|you've)\b/i.test(p)) return fail("addresses_reader", p);
  }
  for (const p of parts) {
    const g = checkScopeGuard(p);
    if (!g.passed) return fail("scope_guard", g.evidence ?? p);
  }
  if (!checkScopeGuard(all).passed) return fail("scope_guard", all);
  if (!checkNoFreelancedProbability(all, []).passed) return fail("freelanced_probability", all);

  const allowed = allowedNumbersFor(inputs);
  for (const p of parts) {
    for (const n of extractNumbers(p)) {
      if (!allowed.has(n)) return fail("number_not_in_inputs", `${n} in "${p}"`);
    }
  }
  for (const p of parts) {
    const j = unexplainedJargon(p);
    if (j) return fail("unexplained_jargon", `${j} in "${p}"`);
  }
  for (const p of parts) {
    for (const sentence of sentences(p)) {
      if (wordCount(sentence) > MAX_SENTENCE_WORDS) return fail("sentence_too_long", sentence);
    }
  }
  return { passed: true, reason: null };
}

// ----------------------------------------------------------------- template

function dim(card: Scorecard, key: Dimension["key"]): Dimension | undefined {
  return card.dimensions.find((d) => d.key === key);
}

export function qualityPhrase(growth: string | undefined, health: string | undefined): string {
  if (growth === "Shrinking") return health === "Stretched" ? "A company with shrinking sales and stretched finances" : "A company whose sales are shrinking";
  if (growth === "Strong") {
    if (health === "Strong") return "A strong, growing company";
    if (health === "Stretched") return "A fast-growing company with stretched finances";
    return "A fast-growing company";
  }
  if (growth === "Steady") {
    if (health === "Strong") return "A financially strong company with steady sales";
    if (health === "Stretched") return "A steady company with stretched finances";
    return "A steady company";
  }
  if (health === "Strong") return "A financially strong company";
  if (health === "Stretched") return "A company with stretched finances";
  return "A company";
}

/** Relative to the share's own history, never "cheap": that reads as "a bargain". */
function pricePhrase(valuation: string | undefined): string {
  if (valuation === VALUATION_VERDICTS.pricier) return " whose share costs more than usual for its profit";
  if (valuation === VALUATION_VERDICTS.cheaper) return " whose share costs less than usual for its profit";
  if (valuation === VALUATION_VERDICTS.usual) return " whose share is priced about as usual for its profit";
  return "";
}

/** "Earnings in 5 days" -> "Earnings are due in 5 days." Only within two weeks. */
function eventPhrase(next: Dimension | undefined): string {
  if (!next || next.verdict === NO_EVENT_VERDICT) return "";
  const days = next.inputs.find((i) => i.label === "Days until the event")?.value;
  if (typeof days !== "number" || days > 14) return "";
  const when = days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
  if (next.verdict.startsWith("Earnings")) return next.verdict.includes("estimated") ? ` Earnings are expected ${when} (an estimate).` : ` Earnings are due ${when}.`;
  if (next.verdict.startsWith("Dividend cut-off")) return ` Its dividend cut-off date is ${when}.`;
  if (next.verdict.startsWith("Dividend payment")) return ` Its next dividend is paid ${when}.`;
  return "";
}

export function templateSummary(inputs: SummaryInputs): SummaryText {
  const card = inputs.scorecard;
  const company = ["valuation", "growth", "health", "dividend"].map((k) => dim(card, k as Dimension["key"]));
  const companyApplies = company.some((d) => d && d.level !== "not_applicable");
  const next = dim(card, "next_event");

  let headline: string;
  if (!companyApplies) {
    headline =
      inputs.assetType === "crypto"
        ? `${inputs.name} has no company behind it, so only its price record applies.`
        : inputs.assetType === "etf"
          ? `${inputs.name} is a fund holding many companies, so this covers its price record.`
          : `${inputs.name}'s company figures are not available, so this covers its price record.`;
  } else {
    headline = `${qualityPhrase(dim(card, "growth")?.verdict, dim(card, "health")?.verdict)}${pricePhrase(dim(card, "valuation")?.verdict)}.`;
  }
  headline += eventPhrase(next);

  const bullets: string[] = [];
  const order: Dimension["key"][] = ["growth", "valuation", "health", "dividend", "trend"];
  for (const k of order) {
    const d = dim(card, k);
    if (!d || d.level === "not_applicable") continue;
    bullets.push(d.sentence);
    if (bullets.length === 4) break;
  }
  if (bullets.length < 4 && inputs.history?.status === "ok") bullets.push(inputs.history.headline);
  if (bullets.length < 3 && next && next.verdict !== NO_EVENT_VERDICT && !eventPhrase(next)) bullets.push(next.sentence);
  return { headline, bullets };
}

// --------------------------------------------------------------- generation

export const SUMMARY_SYSTEM_PROMPT = `You write the "In plain words" summary at the top of a stock or crypto page for everyday investors.

You are given the page's scorecard (six short, already-computed descriptions of the company's numbers and price) and,
when available, what happened in similar moments in its own price history. Write ONE headline (one sentence, two at
most) and 3 or 4 short bullets that tell a beginner what matters most.

Hard rules, no exceptions:
- Plain English a 12-year-old can follow. Every sentence under 20 words.
- Use ONLY numbers that appear in the input, written exactly as given (digits, same rounding). Never round,
  estimate, add up or invent a number. If you are unsure, leave the number out.
- No finance jargon. If a term like EBITDA is unavoidable, put its plain meaning in brackets right after it,
  exactly as the input does.
- Describe the company and its share. Never address the reader: no "you" or "your".
- Never say or hint what anyone should do: no buy, sell, hold, trim, add, take profits, "good time to", "consider".
- No predictions and no probabilities. The history result is a past pattern; describe it as one.
Return JSON: {"headline": string, "bullets": string[]}`;

export type Completer = (req: { system: string; user: string }) => Promise<SummaryText | null>;

function modelPayload(inputs: SummaryInputs): string {
  return JSON.stringify({
    name: inputs.name,
    kind: inputs.assetType,
    scorecard: inputs.scorecard.dimensions.map((d) => ({ topic: d.label, verdict: d.verdict, description: d.sentence })),
    history: inputs.history ? { summary: inputs.history.headline, range: inputs.history.rangeSentence, confidence: inputs.history.confidenceSentence } : null,
  });
}

function isSummaryText(v: unknown): v is SummaryText {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.headline === "string" && Array.isArray(o.bullets) && o.bullets.every((b) => typeof b === "string");
}

async function defaultCompleter(req: { system: string; user: string }): Promise<SummaryText | null> {
  const { llmCompleteJson } = await import("@/lib/ai/llm");
  return llmCompleteJson<SummaryText>(
    {
      system: req.system,
      messages: [{ role: "user", content: req.user }],
      maxTokens: 400,
      temperature: 0.2,
      schemaName: "plain_summary",
      jsonSchema: {
        type: "object",
        additionalProperties: false,
        required: ["headline", "bullets"],
        properties: { headline: { type: "string" }, bullets: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 4 } },
      },
    },
    isSummaryText,
  );
}

const ULTRA_SAFE = (name: string): SummaryText => ({ headline: `${name}: the scorecard below describes its numbers.`, bullets: [] });

function fromTemplate(inputs: SummaryInputs, failure: SummaryFailure, evidence?: string): PlainSummary {
  let t = templateSummary(inputs);
  // Defense in depth: the template must pass the same checks it stands in for.
  if (!checkSummaryText(t, inputs, { minBullets: 0 }).passed) t = ULTRA_SAFE(inputs.name);
  return { ...t, source: "template", failure, evidence, generatedAt: new Date().toISOString() };
}

export async function generatePlainSummary(inputs: SummaryInputs, complete: Completer = defaultCompleter): Promise<PlainSummary> {
  let out: SummaryText | null;
  try {
    out = await complete({ system: SUMMARY_SYSTEM_PROMPT, user: modelPayload(inputs) });
  } catch (err) {
    return fromTemplate(inputs, "model_error", err instanceof Error ? err.message.slice(0, 200) : String(err));
  }
  if (!out || !isSummaryText(out)) return fromTemplate(inputs, "model_unusable");
  const text = { headline: out.headline.trim(), bullets: out.bullets.map((b) => b.trim()).filter(Boolean) };
  const check = checkSummaryText(text, inputs);
  if (!check.passed) return fromTemplate(inputs, check.reason!, check.evidence);
  return { ...text, source: "model", failure: null, generatedAt: new Date().toISOString() };
}
