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
//     sentence under "What's happening" (news and web) carries one.
//  4. The layer-3 classifier, run by the agent after these pass.

import { checkScopeGuard, isRefusalClause, splitClauses } from "@/lib/ai/scope-guard";
import { hasAdvicePhrasing, hasCertainty } from "@/lib/ai/analysis-text";
import type { AnswerDraft, AssistantSource, ToolOutcome } from "@/lib/ai/assistant/types";

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
  const allowed = allowedNumbers(outcomes);
  const bad = unsourcedNumbers(answerText(a), allowed);
  return bad.length === 0 ? PASS : failWith("number_not_in_tool_results", bad.slice(0, 5).join(", "));
}

export function checkScope(a: AnswerDraft, outcomes: ToolOutcome[]): GuardResult {
  const text = answerText(a);
  const scope = checkScopeGuard(text);
  if (!scope.passed) return failWith(`scope_guard:${scope.reason}`, scope.evidence);
  for (const clause of splitClauses(stripQuotes(text))) {
    if (isRefusalClause(clause)) continue;
    if (hasAdvicePhrasing(clause)) return failWith("advice_phrasing", clause);
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

export function checkCitations(a: AnswerDraft, sources: AssistantSource[]): GuardResult {
  const valid = new Set(sources.map((s) => s.n));
  for (const m of answerText(a).matchAll(CITATION)) {
    if (!valid.has(Number(m[1]))) return failWith("citation_to_unknown_source", m[0]);
  }
  for (const s of a.sections.filter((x) => x.heading === "What's happening")) {
    for (const sentence of sentencesOf(s.body)) {
      if (!/\[\d{1,2}\]/.test(sentence)) return failWith("uncited_news_claim", sentence);
    }
  }
  // "according to", "reported" etc. anywhere else must also cite.
  for (const s of a.sections) {
    for (const sentence of sentencesOf(s.body)) {
      if (/\b(?:according\s+to|reported|reports|reportedly|announced|said|says)\b/i.test(sentence) && !/\[\d{1,2}\]/.test(sentence)) {
        return failWith("uncited_news_claim", sentence);
      }
    }
  }
  return PASS;
}

/** The deterministic guards, in order. The classifier (layer 3) runs after, in the agent. */
export function checkAnswer(a: AnswerDraft, outcomes: ToolOutcome[], sources: AssistantSource[]): GuardResult {
  if (!a.lead.trim()) return failWith("structure", "empty lead");
  for (const check of [checkScope(a, outcomes), checkFigures(a, outcomes), checkCitations(a, sources)]) if (!check.passed) return check;
  return PASS;
}
