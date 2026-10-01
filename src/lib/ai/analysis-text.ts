// What the model writes for a ticker analysis, and the guards that decide
// whether it is stored (docs/decisions/2026-09-27-analysis-rebuild.md).
//
// The model is handed ONE block of computed figures, in this order: what
// history says (direction and typical range, lib/ai/direction.ts), the seven-
// part scorecard (lib/scorecard.ts), upcoming dated events, 3-6 recent sourced
// headlines, and the trader figures last, marked context-only. It writes:
//
//   headline      one plain sentence
//   bullets       3-4 short bullets
//   watch         1-3 things to watch, each tied to an event id or a news id
//   sources_used  the news ids it relied on
//
// It never picks a number. Every guard below runs on the server and fails
// CLOSED; the draft gets one retry, and a second failure stores Cairn's code
// template (built from the scorecard and history sentences), labelled
// `template`. Text that did not pass is never stored.

import { checkNoFreelancedProbability, checkScopeGuard } from "@/lib/ai/scope-guard";
import type { ClassifierOutcome } from "@/lib/ai/scope-classifier";
import {
  MAX_SENTENCE_WORDS,
  NUMBER_WORDS,
  pricePhrase,
  qualityPhrase,
  sentences,
  unexplainedJargon,
  wordCount,
} from "@/lib/ai/plain-summary";
import type { DirectionalHistory } from "@/lib/ai/direction";
import { plainDate, VALUATION_VERDICTS, type Dimension, type Scorecard } from "@/lib/scorecard";

// ------------------------------------------------------------------- types

export interface TextEvent {
  /** Short id the model cites ("E1"). */
  id: string;
  /** calendar_events.id, what is stored. */
  rowId: string;
  kind: "earnings" | "ex_dividend" | "dividend_payment";
  date: string;
  estimated: boolean;
}

export interface TextNews {
  /** Short id the model cites ("N1"). */
  id: string;
  /** news_items.id, what is stored. */
  rowId: string;
  title: string;
  source: string;
  /** ISO date published. */
  date: string;
}

export interface TextInputs {
  name: string;
  symbol: string;
  assetType: string | null;
  history: DirectionalHistory | null;
  /** Why there is no history (only read when `history` is null). */
  noHistoryReason: "no_active_conditions" | "insufficient_instances" | "no_price_history" | null;
  /**
   * "baseline": `history` is the base rate (never "similar moments") - either
   * nothing is unusual today, or (with `fallback`) today's setup matched too
   * few past moments. "earnings": results are due within the horizon and
   * `history` is past results releases measured from the same point before.
   */
  historyBasis?: HistoryBasis;
  /** Present when the history is a fallback because the similar-moment scan came up short. */
  fallback?: HistoryContext["fallback"];
  /** For "earnings": sessions until results. */
  sessionsToRelease?: number;
  /** Plain words for what the similar moments were matched on. */
  matchedOn?: string[];
  scorecard: Scorecard;
  events: TextEvent[];
  news: TextNews[];
  /** Set when no news mentions it: the plain line saying so (lib/ai/data-sources.ts noNewsLine). */
  noNews?: string;
  /** What the figures were computed from besides news, in words (context for the model, never cited by id). */
  dataSources?: string[];
  /** Context for the model only; none of these numbers may appear in the text. */
  trader: {
    moveBandLow: number;
    moveBandHigh: number;
    moveBandPoint: number;
    hitCount: number;
    sampleCount: number;
    readings: { label: string; display: string }[];
  } | null;
}

export interface ModelAnalysisText {
  headline: string;
  bullets: string[];
  watch: { text: string; ref: string }[];
  sources_used: string[];
}

/** As stored: refs are `event:<calendar_events.id>` / `source:<news_items.id>`, sources are news ids. */
export type StoredAnalysisText = ModelAnalysisText;

export type TextFailure =
  | "structure"
  | "addresses_reader"
  | "scope_guard"
  | "advice_phrasing"
  | "stated_as_fact"
  | "elevated_move"
  | "freelanced_probability"
  | "number_not_in_inputs"
  | "unexplained_jargon"
  | "sentence_too_long"
  | "watch_unsourced"
  | "unknown_source"
  | "baseline_called_similar"
  | "classifier_flagged"
  | "classifier_unavailable"
  | "model_error"
  | "model_unusable";

export interface TextCheck {
  passed: boolean;
  reason: TextFailure | null;
  evidence?: string;
}

// ------------------------------------------------------- history in words

const signedPct = (v: number): string => {
  const r = Math.round(Math.abs(v) + 1e-9);
  if (r === 0) return "0%";
  return `${v < 0 ? "−" : "+"}${r}%`;
};

/** "2 weeks" for a share (10 sessions), "10 days" for a coin (it trades daily). */
export function horizonPhrase(sessions: number, assetType: string | null): string {
  if (assetType === "crypto") return `${sessions} days`;
  return sessions % 5 === 0 ? `${sessions / 5} week${sessions === 5 ? "" : "s"}` : `${sessions} trading days`;
}

export type HistoryBasis = "similar" | "baseline" | "earnings";

/** What a fallback history needs to say which one it is. */
export interface HistoryContext {
  fallback?: { matches: number };
  sessionsToRelease?: number;
}

export interface HistoryWords {
  line: string;
  range: string | null;
  extremes: string | null;
  confidence: string;
  caveat: string;
}

export function historyWords(
  h: DirectionalHistory | null,
  name: string,
  assetType: string | null,
  noHistoryReason: TextInputs["noHistoryReason"],
  /** "baseline": `h` is every stretch of its history - worded as the base rate. "earnings": past results releases. */
  basis: HistoryBasis = "similar",
  ctx: HistoryContext = {},
): HistoryWords | null {
  const caveat = "This is what happened before, not a forecast.";
  // A fallback says why it is not similar moments before it says anything else.
  const unusual = ctx.fallback
    ? `Today's setup for ${name} is unusual: it matched ${ctx.fallback.matches === 0 ? "no" : `only ${ctx.fallback.matches}`} past moment${ctx.fallback.matches === 1 ? "" : "s"}, too few to measure.`
    : null;
  if (!h) {
    const line =
      noHistoryReason === "no_active_conditions"
        ? `${name} isn't in an unusual price state today, so there are no similar past moments to compare.`
        : noHistoryReason === "insufficient_instances"
          ? `${name} has rarely looked like this before, too rarely to say what usually follows.`
          : `There is not enough stored price history for ${name} to look for similar moments.`;
    return { line, range: null, extremes: null, confidence: "Confidence: low.", caveat };
  }
  const when = horizonPhrase(h.horizonSessions, assetType);
  if (h.status === "too_few" && basis === "baseline") {
    const line = unusual
      ? `${unusual} Too little price history is stored to give its usual pattern instead.`
      : `Nothing is unusual about ${name}'s price today, and too little price history is stored to give its usual pattern.`;
    return { line, range: null, extremes: null, confidence: "Confidence: low.", caveat };
  }
  if (h.status === "too_few") {
    const line =
      h.n === 0
        ? `No similar moments were found in ${name}'s stored prices.`
        : `Only ${h.n} similar moment${h.n === 1 ? "" : "s"} in ${name}'s stored prices, too few to say what usually follows.`;
    return { line, range: null, extremes: null, confidence: "Confidence: low.", caveat };
  }
  const t = h.typical!;
  return {
    line:
      basis === "earnings"
        ? `${unusual ? `${unusual} ` : ""}Results are due in ${ctx.sessionsToRelease} trading day${ctx.sessionsToRelease === 1 ? "" : "s"}. From the same point before past results, ${name} ended higher ${when} later in ${h.higher} of ${h.n}.`
        : basis === "baseline" && unusual
          ? `${unusual} Its base rate instead: over any ${when} in its stored prices, it ended higher in ${h.higher} of ${h.n}.`
          : basis === "baseline"
            ? `Nothing is unusual about ${name}'s price today. Over any ${when} in its stored prices, it ended higher in ${h.higher} of ${h.n}.`
            : `Higher ${when} later in ${h.higher} of ${h.n} similar moments.`,
    range: `Usually between ${signedPct(t.p25)} and ${signedPct(t.p75)}, with the middle case ${signedPct(t.median)}.`,
    extremes: `The worst case was ${signedPct(h.worst!)} and the best ${signedPct(h.best!)}.`,
    confidence: `Confidence: ${h.confidence}, from ${h.confidence === "high" ? "" : "only "}${h.n} cases.`,
    caveat,
  };
}

/** The fallback context historyWords needs, from the text inputs. */
export function historyContext(i: Pick<TextInputs, "fallback" | "sessionsToRelease">): HistoryContext {
  return { ...(i.fallback ? { fallback: i.fallback } : {}), ...(i.sessionsToRelease !== undefined ? { sessionsToRelease: i.sessionsToRelease } : {}) };
}

// ------------------------------------------------------------- the inputs

/**
 * The publisher a reader would name: "MarketWatch Top Stories (RSS)" ->
 * "MarketWatch", "Yahoo Finance News" -> "Yahoo Finance". Stored source names
 * are feed names; a watch item that says "see MarketWatch" names its source
 * correctly and used to be rejected for not spelling out the feed.
 */
export function publisherName(source: string): string {
  const plain = source.replace(/\s*\(RSS\)\s*$/i, "").trim();
  const bare = plain.replace(/\s+(?:Top\s+Stories|News|Press\s+Releases|Headlines)$/i, "").trim();
  return bare || plain;
}

/** Whether `text` names the headline's source - the feed name or its publisher. */
export function namesSource(text: string, source: string): boolean {
  const t = text.toLowerCase();
  const plain = source.replace(/\s*\(RSS\)\s*$/i, "").trim().toLowerCase();
  return t.includes(plain) || t.includes(publisherName(source).toLowerCase());
}

/** "18 Nov": the part of a date a watch item must name. */
export function dayMonth(iso: string): string {
  return plainDate(iso).slice(4);
}

function eventLabel(e: TextEvent): string {
  const d = plainDate(e.date);
  if (e.kind === "earnings") return e.estimated ? `Results expected around ${d} (estimated)` : `Results due ${d}`;
  if (e.kind === "ex_dividend") return `Dividend cut-off date ${d}`;
  return `Dividend paid ${d}`;
}

function historyHeader(i: TextInputs, when: string): string {
  const why = i.fallback ? "today's setup matched too few past moments to measure" : "nothing is unusual about it today";
  if (i.historyBasis === "earnings") return `${why}, and results are due within ${when}, so these are its past results releases, each measured ${when} on from the same point before results. These are NOT similar moments; never call them that`;
  if (i.historyBasis === "baseline") return `${why}, so this is its base rate: every ${when} stretch in its stored prices. These are NOT similar moments; never call them that`;
  return `similar moments in its own price history, each measured ${when} later`;
}

export function buildComputedFigures(i: TextInputs): string {
  const hw = historyWords(i.history, i.name, i.assetType, i.noHistoryReason, i.historyBasis, historyContext(i))!;
  const when = i.history ? horizonPhrase(i.history.horizonSessions, i.assetType) : horizonPhrase(10, i.assetType);
  const history = [hw.line, hw.range, hw.extremes, hw.confidence, i.matchedOn && i.matchedOn.length > 0 ? `Matched on: ${i.matchedOn.join("; ")}.` : null, hw.caveat]
    .filter(Boolean)
    .map((l) => `- ${l}`);
  const card = i.scorecard.dimensions.map((d) => `- ${d.label}: ${d.verdict}. ${d.sentence}`);
  const events = i.events.length > 0 ? i.events.map((e) => `- ${e.id}: ${eventLabel(e)}`) : ["- none in Cairn's calendar"];
  const news = i.news.length > 0 ? i.news.map((n) => `- ${n.id}: "${n.title}" (${publisherName(n.source)}, ${dayMonth(n.date.slice(0, 10))})`) : [`- none found.${i.noNews ? ` ${i.noNews}` : ""} Do not mention or imply any news.`];
  const data = (i.dataSources ?? []).map((d) => `- ${d}`);
  const trader = i.trader
    ? [
        `- Chance of a move of 5% or more either way within ${when}: ${i.trader.moveBandLow}% to ${i.trader.moveBandHigh}% (${i.trader.hitCount} of ${i.trader.sampleCount} past cases)`,
        ...i.trader.readings.map((r) => `- ${r.label}: ${r.display}`),
      ]
    : ["- none"];
  return `COMPUTED FIGURES for ${i.name} (${i.symbol}). Calculated in code from stored prices, SEC filings and past cases.
Use only these numbers, written exactly as shown, sign included.

WHAT HISTORY SAYS (${historyHeader(i, when)}):
${history.join("\n")}

SCORECARD (seven plain-language descriptions of its numbers):
${card.join("\n")}

UPCOMING EVENTS (cite by id in "watch"):
${events.join("\n")}

RECENT HEADLINES (cite by id; do not quote any number from a headline):
${news.join("\n")}
${data.length > 0 ? `\nDATA THE FIGURES WERE COMPUTED FROM (context only; do not quote numbers or dates from these lines):\n${data.join("\n")}\n` : ""}
TRADER FIGURES (for context only; do not quote these numbers or mention them):
${trader.join("\n")}`;
}

// ------------------------------------------------------------------ numbers

// A sign only counts when it starts the token ("−3%", "(+6%"), never as the
// hyphen inside "3-6%" or "5-year".
const SIGNED_NUMBER = new RegExp(
  `(?:(?<=^|[\\s(])([+\\-−]))?[$€£]?\\d[\\d,]*(?:\\.\\d+)?%?|\\b(?:${Object.keys(NUMBER_WORDS)
    .filter((w) => w !== "one")
    .join("|")})\\b`,
  "gi",
);

/**
 * Every number in `text`, normalised: "−3%" and "-3%" -> "-3%", "+6%" keeps
 * its sign, "$1,200" -> "1200", "nine" -> "9". "one" is left out: it is far
 * more often "one of" than a figure.
 */
export function extractSignedNumbers(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(SIGNED_NUMBER)) {
    const raw = m[0].toLowerCase();
    if (NUMBER_WORDS[raw]) {
      out.push(NUMBER_WORDS[raw]);
      continue;
    }
    out.push(raw.replace(/−/g, "-").replace(/[$€£,]/g, ""));
  }
  return out;
}

const unsigned = (n: string) => n.replace(/^[+-]/, "");

export function allowedNumbers(i: TextInputs): { signed: Set<string>; magnitude: Set<string> } {
  const hw = historyWords(i.history, i.name, i.assetType, i.noHistoryReason, i.historyBasis, historyContext(i))!;
  const texts: string[] = [i.name, i.symbol, hw.line, hw.range ?? "", hw.extremes ?? "", hw.confidence, ...(i.matchedOn ?? [])];
  for (const d of i.scorecard.dimensions) texts.push(d.verdict, d.sentence, ...d.inputs.map((x) => x.display ?? ""));
  for (const e of i.events) texts.push(plainDate(e.date));
  for (const n of i.news) texts.push(dayMonth(n.date.slice(0, 10)));
  const all = texts.flatMap(extractSignedNumbers);
  return { signed: new Set(all), magnitude: new Set(all.map(unsigned)) };
}

// -------------------------------------------------------------- the checks

const READER = /\b(?:you|your|yours|you're|you'd|you'll|you've)\b/i;

// Advice to an everyday investor rarely says "sell". It arrives as timing
// ("good time to"), prudence ("makes sense", "wise"), verdict nouns ("a buy",
// "a safe bet"), reassurance ("little to worry about") and hindsight
// ("buying before results has worked"). The direction probes in
// scripts/tests/adversarial-scope-guard.ts (Tier C) are phrased that way.
const ADVICE = new RegExp(
  [
    "consider(?:s|ed|ing)?",
    "(?:good|bad|right|best|great|ideal)\\s+(?:time|moment)",
    "time\\s+to\\s+(?:buy|sell|get\\s+in|get\\s+out|act)",
    "tak(?:e|es|ing)\\s+profits?",
    "should(?:n't)?",
    "ought\\s+to",
    "worth\\s+(?:buying|selling|owning|holding|a\\s+look)",
    "entry\\s+point",
    "attractive\\s+(?:entry|price|level)",
    "bargain",
    "recommend\\w*",
    "now\\s+is\\s+the\\s+time",
    "(?:is|looks\\s+like|looks|seems\\s+like)\\s+(?:a\\s+)?(?:strong\\s+|clear\\s+)?(?:buy|sell|hold)",
    "makes?\\s+sense",
    "(?:wise|prudent|smart|sensible)",
    "(?:under|over)valued",
    "safe\\s+bet|sure\\s+thing|no-?brainer",
    "(?:nothing|little|no\\s+need)\\s+to\\s+worry",
    "(?:downside|risk)\\s+(?:is|looks|seems)\\s+(?:limited|low|small)|limited\\s+downside",
    "has\\s+(?:worked|paid\\s+off)|(?:were|was|been)\\s+rewarded|would\\s+have\\s+(?:made|gained|earned|profited)",
  ]
    .map((p) => `\\b(?:${p})\\b`)
    .join("|"),
  "i",
);

const STATED_AS_FACT = new RegExp(
  [
    // "will rise", "is set to climb", "is likely to be higher"
    "\\b(?:will|won't|is\\s+going\\s+to|are\\s+going\\s+to|(?:is|are)\\s+(?:set|poised|bound|sure|certain|expected|likely)\\s+to)\\s+(?:\\w+\\s+){0,2}?" +
      "(?:rise|fall|climb|drop|gain|lose|rally|surge|soar|jump|sink|slide|slump|go\\s+up|go\\s+down|increase|decrease|recover|rebound|bounce|outperform|underperform|double|crash|keep\\s+(?:rising|falling|climbing|going)|(?:be|end|finish|close|stay|remain|hold)\\s+(?:higher|lower|up|down|high|low|strong|weak|elevated|firm))\\b",
    // certainty words
    "\\b(?:guaranteed|certainly|definitely|no\\s+doubt|for\\s+sure)\\b",
    // "can expect gains", "odds favour a rise"
    "\\bexpect(?:s|ed)?\\s+(?:gains|losses|a\\s+(?:rise|fall|drop|rally)|it\\s+to|the\\s+(?:share|price)\\s+to)\\b",
    "\\bodds\\s+(?:favou?r|point\\s+to)|\\bfavou?rs?\\s+(?:a\\s+)?(?:rise|gains?|upside|buyers)\\b",
    // a past pattern restated as a law: "rises after moments like this"
    "\\b(?:rises|falls|climbs|drops|goes\\s+up|goes\\s+down|tends\\s+to\\s+(?:rise|fall|climb|drop))\\s+after\\b",
  ].join("|"),
  "i",
);

const ELEVATED = /\belevated\s+move|[≥±]\s*5\s*%|\b5%\s+(?:or\s+more\s+)?move|big\s+move\s+either\s+way/i;

export function checkAnalysisText(t: ModelAnalysisText, i: TextInputs, opts: { minWatch?: number } = {}): TextCheck {
  const fail = (reason: TextFailure, evidence?: string): TextCheck => ({ passed: false, reason, evidence });
  if (!t || typeof t.headline !== "string" || !Array.isArray(t.bullets) || !Array.isArray(t.watch) || !Array.isArray(t.sources_used)) return fail("structure");
  const headline = t.headline.trim();
  const bullets = t.bullets.map((b) => (typeof b === "string" ? b.trim() : "")).filter(Boolean);
  const watch = t.watch.filter((w) => w && typeof w.text === "string" && w.text.trim()).map((w) => ({ text: w.text.trim(), ref: typeof w.ref === "string" ? w.ref.trim() : "" }));
  if (!headline || sentences(headline).length !== 1) return fail("structure", headline);
  if (bullets.length < 3 || bullets.length > 4) return fail("structure", `${bullets.length} bullets`);
  const minWatch = opts.minWatch ?? (i.events.length > 0 || i.news.length > 0 ? 1 : 0);
  if (watch.length < minWatch || watch.length > 3) return fail("structure", `${watch.length} watch items`);

  const parts = [headline, ...bullets, ...watch.map((w) => w.text)];
  const all = parts.join(" ");

  for (const p of parts) if (READER.test(p)) return fail("addresses_reader", p);
  for (const p of parts) {
    const g = checkScopeGuard(p);
    if (!g.passed) return fail("scope_guard", g.evidence ?? p);
  }
  if (!checkScopeGuard(all).passed) return fail("scope_guard", all);
  for (const p of parts) if (ADVICE.test(p)) return fail("advice_phrasing", p);
  for (const p of parts) if (STATED_AS_FACT.test(p)) return fail("stated_as_fact", p);
  for (const p of parts) if (ELEVATED.test(p)) return fail("elevated_move", p);
  // The base rate is every stretch of history, not moments like today.
  if (i.historyBasis === "baseline" || i.historyBasis === "earnings") for (const p of parts) if (/\bsimilar\s+(?:past\s+)?moments?\b/i.test(p)) return fail("baseline_called_similar", p);
  if (!checkNoFreelancedProbability(all, []).passed) return fail("freelanced_probability", all);

  const allowed = allowedNumbers(i);
  for (const p of parts) {
    for (const n of extractSignedNumbers(p)) {
      const ok = /^[+-]/.test(n) ? allowed.signed.has(n) : allowed.magnitude.has(n);
      if (!ok) return fail("number_not_in_inputs", `${n} in "${p}"`);
    }
  }
  for (const p of parts) {
    const j = unexplainedJargon(p);
    if (j) return fail("unexplained_jargon", `${j} in "${p}"`);
  }
  for (const p of parts) for (const s of sentences(p)) if (wordCount(s) > MAX_SENTENCE_WORDS) return fail("sentence_too_long", s);

  // Watch items: each tied to a real event (and naming its date) or a real
  // headline (and naming its source).
  const events = new Map(i.events.map((e) => [e.id, e]));
  const news = new Map(i.news.map((n) => [n.id, n]));
  for (const w of watch) {
    const e = events.get(w.ref);
    const n = news.get(w.ref);
    if (e) {
      if (!w.text.includes(dayMonth(e.date))) return fail("watch_unsourced", `${w.ref} without its date: "${w.text}"`);
    } else if (n) {
      if (!namesSource(w.text, n.source)) return fail("watch_unsourced", `${w.ref} without naming ${publisherName(n.source)}: "${w.text}"`);
    } else {
      return fail("watch_unsourced", `"${w.text}" cites "${w.ref}"`);
    }
  }
  for (const s of t.sources_used) if (!news.has(s)) return fail("unknown_source", String(s));
  return { passed: true, reason: null };
}

// ---------------------------------------------------------------- template

function dim(card: Scorecard, key: Dimension["key"]): Dimension | undefined {
  return card.dimensions.find((d) => d.key === key);
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

// -------------------------------------------------- the template headline
//
// The template headline used to be one fixed shape - "X is a fast-growing
// company whose share costs less than usual for its profit" - so every ticker
// that fell back to the template read the same. It now leads with whatever is
// most distinctive about the ticker TODAY, from the same computed inputs:
// results or a dividend date coming up soon, a lopsided similar-moments
// record, a big six-month move, stretched finances or shrinking sales, and
// only then price versus profit. The runner-up is added when the sentence
// stays short. Every candidate must pass checkAnalysisText like model text.

/** An event this close is the news. */
const EVENT_SOON_DAYS = 14;
/** A similar-moments record at least this far from a coin toss is worth leading with. */
const SKEWED_HISTORY = 0.2;
/** A six-month move at least this big (percent) is worth leading with. */
const BIG_SIX_MONTH_MOVE_PCT = 25;

export interface HeadlineLead {
  key: "event" | "history" | "trend" | "finances" | "valuation" | "growth";
  score: number;
  /** A full clause with its subject: "NVIDIA's share is up 31% over 6 months". */
  clause: string;
  /** The same fact as a tail after another clause: "its share is up 31% over 6 months". */
  tail: string;
}

const daysUntil = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

export function headlineLeads(i: TextInputs): HeadlineLead[] {
  const leads: HeadlineLead[] = [];
  const card = i.scorecard;
  const noun = i.assetType === "crypto" || i.assetType === "etf" ? "price" : "share";
  const today = card.asOf.slice(0, 10);

  const e = i.events[0];
  if (e) {
    const days = daysUntil(today, e.date);
    if (days >= 0 && days <= EVENT_SOON_DAYS) {
      const when = `${e.estimated ? "around" : "on"} ${plainDate(e.date)}${e.estimated ? " (estimated)" : ""}`;
      const [clause, tail] =
        e.kind === "earnings"
          ? [`${i.name} reports results ${when}`, `results are due ${when}`]
          : e.kind === "ex_dividend"
            ? [`${i.name}'s dividend cut-off date is ${plainDate(e.date)}`, `its dividend cut-off date is ${plainDate(e.date)}`]
            : [`${i.name} pays its dividend on ${plainDate(e.date)}`, `it pays its dividend on ${plainDate(e.date)}`];
      leads.push({ key: "event", score: 100 - days, clause, tail });
    }
  }

  const h = i.history;
  if (h && h.status === "ok" && i.historyBasis !== "baseline" && h.confidence !== "low" && h.n > 0) {
    const skew = Math.abs(h.higher / h.n - 0.5);
    if (skew >= SKEWED_HISTORY) {
      const fact = `was higher ${horizonPhrase(h.horizonSessions, i.assetType)} later in ${h.higher} of ${h.n} similar moments`;
      leads.push({ key: "history", score: 60 + skew * 100, clause: `${i.name}'s ${noun} ${fact}`, tail: `its ${noun} ${fact}` });
    }
  }

  const trend = dim(card, "trend");
  const move = trend?.sentence.match(/^(Up|Down) (\d+(?:\.\d+)?%) over 6 months/);
  if (trend && move && Number.parseFloat(move[2]) >= BIG_SIX_MONTH_MOVE_PCT) {
    const fact = `is ${move[1].toLowerCase()} ${move[2]} over 6 months`;
    leads.push({ key: "trend", score: 40 + Math.min(Number.parseFloat(move[2]), 100) / 5, clause: `${i.name}'s ${noun} ${fact}`, tail: `its ${noun} ${fact}` });
  }

  const growth = dim(card, "growth");
  const health = dim(card, "health");
  if (health?.verdict === "Stretched") leads.push({ key: "finances", score: 45, clause: `${i.name}'s finances are stretched`, tail: "its finances are stretched" });
  else if (growth?.verdict === "Shrinking") leads.push({ key: "finances", score: 45, clause: `${i.name}'s sales are shrinking`, tail: "its sales are shrinking" });

  const valuation = dim(card, "valuation")?.verdict;
  const cost = valuation === VALUATION_VERDICTS.cheaper ? "less than usual" : valuation === VALUATION_VERDICTS.pricier ? "more than usual" : null;
  if (cost) leads.push({ key: "valuation", score: 30, clause: `${i.name}'s share costs ${cost} for its profit`, tail: `its share costs ${cost} for its profit` });

  if (growth?.verdict === "Strong") leads.push({ key: "growth", score: 20, clause: `${i.name}'s sales are growing fast`, tail: "its sales are growing fast" });

  return leads.sort((a, b) => b.score - a.score);
}

/** "NVIDIA's share is up 31% over 6 months" + "its share costs less..." -> "... and costs less ...". */
function joinLeads(lead: HeadlineLead, next: HeadlineLead, name: string): string {
  const subject = lead.clause.match(new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}'s (share|price) `))?.[1];
  if (subject && next.tail.startsWith(`its ${subject} `)) return `${lead.clause} and ${next.tail.slice(`its ${subject} `.length)}.`;
  return `${lead.clause}, and ${next.tail}.`;
}

/** The fixed shape, now only the fallback when nothing about today stands out. */
function plainHeadline(i: TextInputs, companyApplies: boolean): string {
  const card = i.scorecard;
  return companyApplies
    ? `${i.name} is ${lowerFirst(qualityPhrase(dim(card, "growth")?.verdict, dim(card, "health")?.verdict))}${pricePhrase(dim(card, "valuation")?.verdict)}.`
    : i.assetType === "crypto"
      ? `${i.name} has no company behind it, so this covers its price record.`
      : i.assetType === "etf"
        ? `${i.name} is a fund holding many companies, so this covers its price record.`
        : `${i.name}'s company figures are not available, so this covers its price record.`;
}

export function distinctiveHeadline(i: TextInputs, companyApplies: boolean): string {
  const filler = "Every figure here comes from stored prices and filings.";
  const ok = (headline: string) =>
    sentences(headline).length === 1 &&
    wordCount(headline) <= MAX_SENTENCE_WORDS &&
    checkAnalysisText({ headline, bullets: [filler, filler, filler], watch: [], sources_used: [] }, i, { minWatch: 0 }).passed;

  const leads = headlineLeads(i);
  for (const [n, lead] of leads.entries()) {
    const next = leads.slice(n + 1).find((l) => l.key !== lead.key);
    if (next) {
      const both = joinLeads(lead, next, i.name);
      if (ok(both)) return both;
    }
    const alone = `${lead.clause}.`;
    if (ok(alone)) return alone;
  }
  return plainHeadline(i, companyApplies);
}

/** Cairn's own words, built from the scorecard and history sentences. Passes checkAnalysisText. */
export function templateAnalysisText(i: TextInputs): ModelAnalysisText {
  const card = i.scorecard;
  const companyApplies = ["valuation", "growth", "health", "dividend"].some((k) => {
    const d = dim(card, k as Dimension["key"]);
    return d && d.level !== "not_applicable";
  });
  const headline = distinctiveHeadline(i, companyApplies);

  const hw = historyWords(i.history, i.name, i.assetType, i.noHistoryReason, i.historyBasis, historyContext(i))!;
  const partOk = (s: string) => {
    const probe = { headline, bullets: [s, s, s], watch: [], sources_used: [] };
    return checkAnalysisText(probe, i, { minWatch: 0 }).passed;
  };
  const candidates: string[] = [];
  for (const k of ["health", "valuation", "trend"] as Dimension["key"][]) {
    const d = dim(card, k);
    if (d && d.level !== "not_applicable") candidates.push(d.sentence);
  }
  candidates.push([hw.line, hw.range].filter(Boolean).join(" "));
  for (const k of ["growth", "dividend"] as Dimension["key"][]) {
    const d = dim(card, k);
    if (d && d.level !== "not_applicable") candidates.push(d.sentence);
  }
  candidates.push(`${hw.confidence} ${hw.caveat}`);
  // The history bullet always makes the cut: it is the section's point.
  const historyBullet = candidates.find((c) => c.startsWith(hw.line))!;
  let bullets = candidates.filter(partOk);
  if (!bullets.includes(historyBullet) && partOk(historyBullet)) bullets.unshift(historyBullet);
  if (bullets.length > 4) {
    const rest = bullets.filter((b) => b !== historyBullet).slice(0, 3);
    bullets = [...rest.slice(0, 2), historyBullet, ...rest.slice(2)].slice(0, 4);
  }
  // No news: said plainly in the summary itself, not only in the sources list.
  if (i.noNews && partOk(i.noNews)) bullets = [...bullets.slice(0, 3), i.noNews];
  for (const filler of ["Every figure here comes from stored prices and filings.", "The full breakdown below shows how each one was worked out."]) {
    if (bullets.length >= 3) break;
    bullets.push(filler);
  }

  const watch: ModelAnalysisText["watch"] = [];
  const sources: string[] = [];
  for (const e of i.events.slice(0, 3)) watch.push({ text: `${eventLabel(e)}.`, ref: e.id });
  if (watch.length === 0) {
    for (const n of i.news) {
      if (/\d/.test(n.title)) continue;
      const item = { text: `${n.title.replace(/[.!?]+$/, "")}: see ${n.source}, ${dayMonth(n.date.slice(0, 10))}.`, ref: n.id };
      if (checkAnalysisText({ headline, bullets: bullets.slice(0, 3), watch: [item], sources_used: [n.id] }, i, { minWatch: 0 }).passed) {
        watch.push(item);
        sources.push(n.id);
        break;
      }
    }
  }
  return { headline, bullets, watch, sources_used: sources };
}

// -------------------------------------------------------------- generation

export const ANALYSIS_SYSTEM_PROMPT = `You write the analysis at the top of a share or coin page on Cairn, for everyday investors.

You are given COMPUTED FIGURES: what happened in similar past moments in its own price history, a seven-part
scorecard, upcoming dated events and recent sourced headlines. All of it was calculated in code. You only
write words around it.

Return JSON: {"headline": string, "bullets": string[], "watch": [{"text": string, "ref": string}], "sources_used": string[]}
- headline: ONE sentence a 12-year-old can follow, saying what is going on with it.
- bullets: 3 or 4 short bullets: company health, price vs its usual level, the trend, and what history shows.
  Lead with direction and typical range, e.g. "higher 2 weeks later in 9 of 14 similar moments, usually between −2% and +3%".
- watch: 1 to 3 concrete things to watch. Each cites ONE event id (E1...) and names its date, or ONE headline
  id (N1...) and names its source and date. E.g. "Results expected around Wed 18 Nov (estimated)." or
  "Chip export rules, see Reuters, 24 Sep."
- sources_used: the headline ids (N1...) you relied on.

Hard rules, no exceptions:
- Use ONLY numbers that appear in COMPUTED FIGURES, written exactly as shown, sign included. Never round,
  estimate, add up or invent a number. Never quote a number from a headline or from TRADER FIGURES.
- Never say "elevated move" and never state a chance of a big move either way.
- No advice and no imperatives: never "buy", "sell", "hold", "consider", "good time to", "take profits", "should", "worth".
- Never address the reader: no "you" or "your". Describe the company and its share.
- No predictions stated as fact: never "will rise", "is set to fall". History is what happened before, not a forecast.
- The first time a finance term appears (P/E, EBITDA, dividend yield...), explain it in brackets right after it.
  Write out comparisons in words: "than a year ago", never abbreviations like "YoY" or "TTM".
- In "watch", name a headline's source exactly as it is shown in brackets (e.g. "MarketWatch", "Yahoo Finance").
- Every sentence under 20 words.`;

type CompleterResult = ModelAnalysisText | { parsed: ModelAnalysisText; model: string } | null;
export type AnalysisCompleter = (req: { system: string; user: string }) => Promise<CompleterResult>;
export type ScopeClassify = (text: string) => Promise<ClassifierOutcome>;

/**
 * [DECISION: Adam] What happens to a stored analysis when the scope classifier
 * (layer 3) is unreachable. Recommended and default: `strict` - no model text
 * is stored that the classifier never saw; the template is stored instead.
 * `ANALYSIS_CLASSIFIER_MODE=advisory` allows it on layers 1-2 alone. Separate
 * from SCOPE_CLASSIFIER_MODE (chat), which this does not change.
 */
export function analysisClassifierMode(flag: string | undefined = process.env.ANALYSIS_CLASSIFIER_MODE): "strict" | "advisory" {
  return flag === "advisory" ? "advisory" : "strict";
}

function isModelText(v: unknown): v is ModelAnalysisText {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.headline === "string" &&
    Array.isArray(o.bullets) &&
    o.bullets.every((b) => typeof b === "string") &&
    Array.isArray(o.watch) &&
    o.watch.every((w) => !!w && typeof w === "object" && typeof (w as { text?: unknown }).text === "string") &&
    Array.isArray(o.sources_used)
  );
}

const TEXT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "bullets", "watch", "sources_used"],
  properties: {
    headline: { type: "string" },
    bullets: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 4 },
    watch: {
      type: "array",
      maxItems: 3,
      items: { type: "object", additionalProperties: false, required: ["text", "ref"], properties: { text: { type: "string" }, ref: { type: "string" } } },
    },
    sources_used: { type: "array", items: { type: "string" } },
  },
};

async function defaultCompleter(req: { system: string; user: string }): Promise<CompleterResult> {
  const { llmCompleteJsonWithProvider } = await import("@/lib/ai/llm");
  const { parsed, modelVersion } = await llmCompleteJsonWithProvider<ModelAnalysisText>(
    { system: req.system, messages: [{ role: "user", content: req.user }], maxTokens: 700, temperature: 0.2, schemaName: "analysis_text", jsonSchema: TEXT_SCHEMA },
    isModelText,
  );
  return { parsed, model: modelVersion };
}

async function defaultClassify(text: string): Promise<ClassifierOutcome> {
  const { classifyScope } = await import("@/lib/ai/scope-classifier");
  return classifyScope(text);
}

/** Short ids -> stored ids. */
function toStored(t: ModelAnalysisText, i: TextInputs): StoredAnalysisText {
  const events = new Map(i.events.map((e) => [e.id, e.rowId]));
  const news = new Map(i.news.map((n) => [n.id, n.rowId]));
  const watch = t.watch
    .filter((w) => w.text.trim())
    .map((w) => ({ text: w.text.trim(), ref: events.has(w.ref) ? `event:${events.get(w.ref)}` : `source:${news.get(w.ref)}` }));
  return {
    headline: t.headline.trim(),
    bullets: t.bullets.map((b) => b.trim()).filter(Boolean),
    watch,
    sources_used: [...new Set(t.sources_used.map((s) => news.get(s)).filter((s): s is string => !!s))],
  };
}

export interface GeneratedText {
  text: StoredAnalysisText;
  source: "model" | "template";
  /** Every failed model draft, in order. Empty when the first draft passed. */
  attempts: { reason: TextFailure; evidence?: string; draft?: ModelAnalysisText }[];
  model?: string;
}

export async function generateAnalysisText(
  i: TextInputs,
  deps: { complete?: AnalysisCompleter; classify?: ScopeClassify; mode?: "strict" | "advisory" } = {},
): Promise<GeneratedText> {
  const complete = deps.complete ?? defaultCompleter;
  const classify = deps.classify ?? defaultClassify;
  const mode = deps.mode ?? analysisClassifierMode();
  const attempts: GeneratedText["attempts"] = [];
  const payload = buildComputedFigures(i);
  let model: string | undefined;

  for (let attempt = 0; attempt < 2; attempt++) {
    const last = attempts[attempts.length - 1];
    const user =
      attempt === 0 || !last
        ? payload
        : `${payload}\n\nYour previous draft was rejected by Cairn's checks (reason: ${last.reason}${last.evidence ? `; ${last.evidence.slice(0, 200)}` : ""}). Write it again and fix that.`;
    let draft: ModelAnalysisText | null;
    try {
      const r = await complete({ system: ANALYSIS_SYSTEM_PROMPT, user });
      if (r && "parsed" in r) {
        draft = r.parsed;
        model = r.model;
      } else draft = r;
    } catch (err) {
      attempts.push({ reason: "model_error", evidence: err instanceof Error ? err.message.slice(0, 200) : String(err) });
      continue;
    }
    if (!draft || !isModelText(draft)) {
      attempts.push({ reason: "model_unusable" });
      continue;
    }
    const check = checkAnalysisText(draft, i);
    if (!check.passed) {
      attempts.push({ reason: check.reason!, evidence: check.evidence, draft });
      continue;
    }
    const verdict = await classify([draft.headline, ...draft.bullets, ...draft.watch.map((w) => w.text)].join("\n"));
    if (verdict.status === "flagged") {
      attempts.push({ reason: "classifier_flagged", evidence: verdict.rationale, draft });
      continue;
    }
    if (verdict.status === "unavailable" && mode === "strict") {
      // A retry cannot bring the classifier back; store the template now.
      attempts.push({ reason: "classifier_unavailable", evidence: verdict.detail, draft });
      break;
    }
    return { text: toStored(draft, i), source: "model", attempts, model };
  }

  // Defense in depth: the template must pass the checks it stands in for.
  // If it ever does not, nothing is stored rather than unchecked text. A name
  // the checks cannot read (SEC's "Lifecore Biomedical, INC. DE" split the
  // headline into two sentences) gets one retry under the bare ticker.
  for (const inputs of i.name === i.symbol ? [i] : [i, { ...i, name: i.symbol }]) {
    const template = templateAnalysisText(inputs);
    const tc = checkAnalysisText(template, inputs, { minWatch: 0 });
    if (tc.passed) return { text: toStored(template, inputs), source: "template", attempts, model };
    if (inputs.name === i.symbol) throw new Error(`Analysis template for ${i.symbol} failed its own checks (${tc.reason}: ${tc.evidence ?? ""}).`);
  }
  throw new Error(`Analysis template for ${i.symbol} failed its own checks.`);
}

// ---------------------------------------------------- shared with the assistant
// The chat assistant (lib/ai/assistant/guards.ts) applies the same advice and
// certainty vocabulary to its answers, so the two surfaces cannot drift.

/** Advice by timing, prudence, verdict nouns or reassurance ("good time to", "a safe bet"). */
export function hasAdvicePhrasing(text: string): boolean {
  return ADVICE.test(text);
}

/** A prediction stated as fact ("will rise", "is set to fall", "guaranteed"). */
export function hasCertainty(text: string): boolean {
  return STATED_AS_FACT.test(text);
}
