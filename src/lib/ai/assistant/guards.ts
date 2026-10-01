// Server-side guards on the assistant's final answer (feat/assistant-v2).
// They run on the text before it is shown or stored, and fail CLOSED: a
// failure gets one repair attempt, then the answer is rebuilt from the tool
// results in code (agent.ts). Four checks:
//
//  1. Figures. Every number in the answer must appear in THIS turn's tool
//     results - the figure-drift idea from scope-guard.ts's
//     checkPortfolioFigureDrift, generalised: the allow-list is every number
//     the tools returned, and it now covers market figures too, not only the
//     reader's portfolio. Exempt, and listed so they can be reviewed: citation
//     marks [n], small counts 0-12 written without % or a currency ("the last
//     3 headlines"), calendar years, and numbers inside names (S&P 500, 10-K,
//     Q3, 200-day).
//  2. Scope. checkScopeGuard (no personal directive), the analysis text's
//     advice and certainty vocabulary ("good time to", "will rise"), and no
//     "For you" section unless the reader's own portfolio was read this turn.
//  3. Citations. Every [n] points at a real source from this turn, and every
//     sentence under "What's happening" (news and web) carries one. The one
//     exception is a sentence that only says nothing was found ("No news was
//     found for X in the last 7 days"): it has nothing to cite, and passes only
//     when a news or web tool this turn really came back empty or failed.
//     Wording alone never earns the exemption.
//  4. The layer-3 classifier, run by the agent after these pass.

import { checkScopeGuard, isRefusalClause, splitClauses } from "@/lib/ai/scope-guard";
import { hasAdvicePhrasing, hasCertainty } from "@/lib/ai/analysis-text";
import type { AnswerDraft, AssistantSource, ToolOutcome } from "@/lib/ai/assistant/types";
import { foundNothing } from "@/lib/ai/assistant/outcomes";

export interface GuardResult {
  passed: boolean;
  reason: string | null;
  evidence?: string;
}

const PASS: GuardResult = { passed: true, reason: null };
const failWith = (reason: string, evidence?: string): GuardResult => ({ passed: false, reason, evidence: evidence?.slice(0, 240) });

/** Numbers that are part of a name, not figures. */
const NAMED_NUMBERS = /\b(?:S&P\s?500|Nasdaq[- ]?100|Russell\s?2000|FTSE\s?100|Dow\s?30|Stoxx\s?600|Nikkei\s?225|10-[KQ]|8-K|20-F|Q[1-4]|H[12]|401\(k\)|24\/7|52-week|200-day|50-day|gpt-oss-120b)\b/gi;
const CITATION = /\[(\d{1,2})\]/g;
const NUMBER = /(?<![\w.])([$€£¥]?)(\d[\d,]*(?:\.\d+)?)(\s?%)?/g;

const parse = (raw: string) => Number(raw.replace(/,/g, ""));

/** Every number the tools returned this turn - the figure allow-list. */
export function allowedNumbers(outcomes: ToolOutcome[]): Set<number> {
  const texts = outcomes.flatMap((o) => [JSON.stringify(o.data), ...o.facts, ...o.tiles.flatMap((t) => [t.label, t.value, t.note ?? ""])]);
  const out = new Set<number>();
  for (const t of texts) for (const m of t.replace(NAMED_NUMBERS, " ").matchAll(NUMBER)) out.add(parse(m[2]));
  return out;
}

/**
 * Every money figure the tools returned, keyed by currency sign AND value:
 * "$|225.07", "€|49.6". The plain allow-list above compares digits only, so
 * "€225.07" for a share the tools priced at "$225.07" would pass it; this is
 * the currency half of the figure check (feat/native-currency).
 */
export function allowedMoney(outcomes: ToolOutcome[]): Set<string> {
  const texts = outcomes.flatMap((o) => [JSON.stringify(o.data), ...o.facts, ...o.tiles.flatMap((t) => [t.label, t.value, t.note ?? ""])]);
  const out = new Set<string>();
  for (const t of texts) for (const m of t.replace(NAMED_NUMBERS, " ").matchAll(NUMBER)) if (m[1]) out.add(`${m[1]}|${parse(m[2])}`);
  return out;
}

/** Money figures in the answer whose currency sign differs from the one the tools gave that value. */
export function wrongCurrencyFigures(text: string, allowed: Set<string>): string[] {
  const cleaned = text.replace(CITATION, " ").replace(NAMED_NUMBERS, " ");
  const bad: string[] = [];
  for (const m of cleaned.matchAll(NUMBER)) {
    const [whole, currency, digits] = m;
    if (!currency) continue;
    if (!allowed.has(`${currency}|${parse(digits)}`)) bad.push(whole.trim());
  }
  return bad;
}

/** Numbers the answer states that are not in the allow-list (exemptions applied). */
export function unsourcedNumbers(text: string, allowed: Set<number>): string[] {
  const cleaned = text.replace(CITATION, " ").replace(NAMED_NUMBERS, " ");
  const bad: string[] = [];
  for (const m of cleaned.matchAll(NUMBER)) {
    const [whole, currency, digits, percent] = m;
    const value = parse(digits);
    if (!Number.isFinite(value)) continue;
    const plainInteger = !currency && !percent && !digits.includes(".") && !digits.includes(",");
    if (plainInteger && value <= 12) continue; // a count, not a figure
    if (plainInteger && value >= 1990 && value <= 2040) continue; // a year
    if (!allowed.has(value)) bad.push(whole.trim());
  }
  return bad;
}

export function answerText(a: AnswerDraft): string {
  return [a.lead, ...a.tiles.map((t) => `${t.label}: ${t.value}${t.note ? ` (${t.note})` : ""}`), ...a.sections.map((s) => `${s.heading}\n${s.body}`), ...a.follow_ups].join("\n");
}

/** Quoted headlines are reported source text, not the assistant's voice. */
const stripQuotes = (s: string) => s.replace(/["“][^"”]{0,300}["”]/g, " ");

export function checkFigures(a: AnswerDraft, outcomes: ToolOutcome[]): GuardResult {
  const text = answerText(a);
  const bad = unsourcedNumbers(text, allowedNumbers(outcomes));
  if (bad.length > 0) return failWith("number_not_in_tool_results", bad.slice(0, 5).join(", "));
  // The number is real, but is it in the currency the tools gave it? A share
  // price copied with the reader's "€" in front of it is a wrong figure.
  const wrong = wrongCurrencyFigures(text, allowedMoney(outcomes));
  return wrong.length === 0 ? PASS : failWith("figure_in_wrong_currency", wrong.slice(0, 5).join(", "));
}

/**
 * No stated view on a market, an investment or what to do: "China is a good
 * place to invest", "I think it looks promising", "bullish". The ADVICE list in
 * analysis-text.ts catches directives and timing; this catches the opinion
 * itself, which is what "what do you think about X" invites.
 */
const OPINION = new RegExp(
  [
    "\\bI\\s+(?:think|believe|feel|reckon|expect|like|prefer|would\\s+say|'d\\s+say)\\b",
    "\\bin\\s+my\\s+(?:opinion|view|judg(?:e)?ment)\\b",
    "\\b(?:bullish|bearish)\\b",
    "\\b(?:risky|safe|good|bad|great|poor|terrible|attractive|unattractive|smart|wise|promising)\\s+(?:place|market|region|country|economy|destination|bet|investment|opportunity|choice)s?\\b",
    "\\bworth\\s+invest\\w*|\\bnot\\s+worth\\s+(?:it|the\\s+risk)\\b",
    "\\b(?:looks?|seems?|appears?)\\s+(?:\\w+\\s+)?(?:promising|attractive|unattractive|risky|safe|overheated)\\b",
  ].join("|"),
  "i",
);

/** The scorecard's own words, from this turn's get_scorecard results: "Weak", "Cheaper than usual". */
function scorecardLabels(outcomes: ToolOutcome[]): string[] {
  const labels: string[] = [];
  for (const o of outcomes) {
    if (o.name !== "get_scorecard" || !o.ok) continue;
    const scores = (o.data as { scores?: { verdict?: string; level?: string }[] } | null)?.scores ?? [];
    for (const sc of scores) for (const w of [sc.verdict, sc.level]) if (w && w !== "not_applicable") labels.push(w.toLowerCase());
  }
  return labels;
}

/**
 * "The price trend is considered weak": "considered" trips the advice list, but
 * the sentence is only repeating a scorecard label. When what follows
 * "considered" is a label from this turn's scorecard it is read as "rated".
 * "considered a bargain" / "considered a good investment" are not labels and
 * still fail.
 */
function readScorecardConsidered(clause: string, labels: string[]): string {
  if (labels.length === 0) return clause;
  return clause.replace(/\b(is|are|was|were)\s+considered\s+([A-Za-z][A-Za-z ]{0,30})/gi, (whole, verb: string, rest: string) => {
    const r = rest.trim().toLowerCase();
    return labels.some((l) => r === l || r.startsWith(`${l} `)) ? `${verb} rated ${rest}` : whole;
  });
}

export function checkScope(a: AnswerDraft, outcomes: ToolOutcome[]): GuardResult {
  const text = answerText(a);
  const scope = checkScopeGuard(text);
  if (!scope.passed) return failWith(`scope_guard:${scope.reason}`, scope.evidence);
  const labels = scorecardLabels(outcomes);
  for (const clause of splitClauses(stripQuotes(text))) {
    if (isRefusalClause(clause)) continue;
    if (hasAdvicePhrasing(readScorecardConsidered(clause, labels))) return failWith("advice_phrasing", clause);
    if (OPINION.test(clause)) return failWith("opinion", clause);
    if (hasCertainty(clause)) return failWith("stated_as_fact", clause);
  }
  const portfolioRead = outcomes.some((o) => o.name === "get_portfolio" && o.ok && !o.error);
  if (!portfolioRead && a.sections.some((s) => s.heading === "For you")) return failWith("for_you_without_portfolio", "a 'For you' section with no portfolio read this turn");
  return PASS;
}

const sentencesOf = (body: string) =>
  body
    .split(/(?<=[.!?])\s+(?=[A-Z"“(])|\n+/)
    .map((s) => s.replace(/^\s*[-*]\s+/, "").trim())
    .filter((s) => /[A-Za-z]{3}/.test(s));

const NEGATION = /\b(?:no|nothing|none|couldn't|could\s+not|can't|cannot|didn't|did\s+not|isn't|is\s+not|wasn't|was\s+not|weren't|were\s+not|hasn't|has\s+not|haven't|not\s+(?:been\s+)?(?:turned|switched)\s+on)\b/i;
const WEB_WORDS = /\b(?:web|search|online|internet)\b/i;
const NEWS_WORDS = /\b(?:news|articles?|headlines?|stories|coverage|stored)\b/i;
const NOT_A_BARE_ABSENCE = /\b(?:but|however|although|though|while|whereas|except|despite)\b|[;:—–"“]|\[\d/i;

/**
 * A sentence that only reports that nothing was found, backed by this turn's
 * tool outcomes. Both must hold:
 *  - its shape: every clause negates ("No news was found...", "Web search isn't
 *    turned on yet, so I couldn't check the web"), and it carries no contrast,
 *    quote, citation or figure other than "N days" - so a claim can't ride
 *    along; and
 *  - its backing: the tool it is about (news, web, or either) ran this turn
 *    and came back empty or failed, and none of that kind returned anything.
 */
export function isBackedAbsence(sentence: string, outcomes: ToolOutcome[]): boolean {
  if (sentence.trim().split(/\s+/).length > 32 || NOT_A_BARE_ABSENCE.test(sentence)) return false;
  if (/\d/.test(sentence.replace(/\b\d{1,2}\s+days?\b/gi, ""))) return false;
  const clauses = sentence.split(/\b(?:and|so)\b/i).filter((c) => c.trim().split(/\s+/).length >= 2);
  if (clauses.length === 0 || !clauses.every((c) => NEGATION.test(c))) return false;
  const kinds = new Set<string>([...(WEB_WORDS.test(sentence) ? ["web_search"] : []), ...(NEWS_WORDS.test(sentence) ? ["get_news"] : [])]);
  if (kinds.size === 0) ["web_search", "get_news"].forEach((k) => kinds.add(k));
  for (const kind of kinds) {
    const ran = outcomes.filter((o) => o.name === kind);
    if (ran.length === 0 || !ran.every(foundNothing)) return false;
  }
  return true;
}

export function checkCitations(a: AnswerDraft, sources: AssistantSource[], outcomes: ToolOutcome[] = []): GuardResult {
  const valid = new Set(sources.map((s) => s.n));
  for (const m of answerText(a).matchAll(CITATION)) {
    if (!valid.has(Number(m[1]))) return failWith("citation_to_unknown_source", m[0]);
  }
  for (const s of a.sections.filter((x) => x.heading === "What's happening")) {
    for (const sentence of sentencesOf(s.body)) {
      if (!/\[\d{1,2}\]/.test(sentence) && !isBackedAbsence(sentence, outcomes)) return failWith("uncited_news_claim", sentence);
    }
  }
  // "according to", "reported" etc. anywhere else must also cite.
  for (const s of a.sections) {
    for (const sentence of sentencesOf(s.body)) {
      if (/\b(?:according\s+to|reported|reports|reportedly|announced|said|says)\b/i.test(sentence) && !/\[\d{1,2}\]/.test(sentence) && !isBackedAbsence(sentence, outcomes)) {
        return failWith("uncited_news_claim", sentence);
      }
    }
  }
  return PASS;
}

/** "I searched the web" / "a web search shows": only when a web search really returned pages this turn. */
const SEARCH_CLAIM = /\b(?:I|we|Cairn)\s+(?:searched|looked\s+(?:up|online)|checked)\s+(?:on\s+)?(?:the\s+)?(?:web|internet|online)\b|\b(?:a\s+|the\s+)?(?:web|online|internet)\s+search\s+(?:shows?|showed|found|finds|returned|says|said|reports?)\b(?!\s+(?:no|nothing|not))|\baccording\s+to\s+(?:a|the)\s+web\s+search\b/i;

export function checkSearchClaims(a: AnswerDraft, outcomes: ToolOutcome[]): GuardResult {
  const text = stripQuotes(answerText(a));
  const claim = text.match(SEARCH_CLAIM)?.[0];
  if (!claim) return PASS;
  return outcomes.some((o) => o.name === "web_search" && o.ok && o.sources.length > 0) ? PASS : failWith("claims_search_not_run", claim);
}

/** A lead that only says "here is the data" with nothing under it is an empty answer. */
const GENERIC_LEAD = /^\s*(?:here\s+is|here's)\s+what\s+(?:cairn's\s+data\s+shows|the\s+(?:data|numbers)\s+say)\.?\s*$/i;

/** The deterministic guards, in order. The classifier (layer 3) runs after, in the agent. */
export function checkAnswer(a: AnswerDraft, outcomes: ToolOutcome[], sources: AssistantSource[]): GuardResult {
  if (!a.lead.trim()) return failWith("structure", "empty lead");
  if (GENERIC_LEAD.test(a.lead) && a.sections.length === 0 && a.tiles.length === 0) return failWith("empty_answer", "a lead that points at data with none under it");
  for (const check of [checkScope(a, outcomes), checkFigures(a, outcomes), checkCitations(a, sources, outcomes), checkSearchClaims(a, outcomes)]) if (!check.passed) return check;
  return PASS;
}
