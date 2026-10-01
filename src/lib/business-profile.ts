// "What it does": a plain-English description of a company, written from its
// own 10-K (feat/business-profile). Pure, so the guards are tested exactly as
// they run.
//
// Source: the opening of the 10-K's "Item 1. Business" section, stored with
// the filing's accession by ingest-business-profile. The model rewrites it in
// plain English; it may phrase, never add. The guards fail CLOSED to a
// template that quotes the company's own words:
//   * structure: one sentence (at most 25 words), then a 2-5 sentence paragraph;
//   * addresses_reader: no "you"/"your";
//   * scope_guard: the same checkScopeGuard every analysis and chat turn passes;
//   * number_not_in_source: every number must appear in the filing excerpt;
//   * future_claim: nothing about what the company will, plans or expects to do;
//   * unsourced_claim: no "leading", "largest", "best"... - the company's own
//     marketing restated as fact;
//   * unexplained_jargon / sentence_too_long: the plain-summary rules.
//
// Whether a business is simple enough to explain in one sentence is the
// reader's judgement, not Cairn's: nothing here says so either way.

import { checkScopeGuard } from "@/lib/ai/scope-guard";
import { extractNumbers, sentences, unexplainedJargon, wordCount, MAX_SENTENCE_WORDS } from "@/lib/ai/plain-summary";

export interface DescriptionInputs {
  name: string;
  sicDescription: string | null;
  /** The opening of Item 1, as stored. */
  excerpt: string;
}

export interface DescriptionText {
  oneLiner: string;
  paragraph: string;
}

export type DescriptionFailure =
  | "structure"
  | "addresses_reader"
  | "scope_guard"
  | "number_not_in_source"
  | "future_claim"
  | "unsourced_claim"
  | "unexplained_jargon"
  | "sentence_too_long"
  | "no_source"
  | "model_error"
  | "model_unusable";

export interface Description extends DescriptionText {
  source: "model" | "template";
  failure: DescriptionFailure | null;
  evidence?: string;
}

export const FUTURE_CLAIM =
  /\b(?:will|won't|shall|plans?\s+to|planning\s+to|expects?\s+to|expected\s+to|aims?\s+to|intends?\s+to|is\s+going\s+to|set\s+to|poised|future|next\s+year|soon|upcoming|forecasts?|projected|anticipat\w*|outlook|guidance)\b/i;

export const UNSOURCED_CLAIM =
  /\b(?:leading|leader|leaders|best|largest|biggest|top|dominant|dominates|premier|world-class|pioneer\w*|innovative|cutting-edge|revolutionary|unique|unmatched|unrivall?ed|trusted|iconic|favou?rite|beloved|fastest-growing|market-leading)\b/i;

export interface CheckResult {
  passed: boolean;
  reason: DescriptionFailure | null;
  evidence?: string;
}

export function checkDescription(d: DescriptionText, inputs: DescriptionInputs): CheckResult {
  const fail = (reason: DescriptionFailure, evidence?: string): CheckResult => ({ passed: false, reason, evidence });
  if (typeof d.oneLiner !== "string" || typeof d.paragraph !== "string") return fail("structure");
  const one = d.oneLiner.trim();
  const para = d.paragraph.trim();
  if (!one || sentences(one).length !== 1) return fail("structure", one);
  const paraSentences = sentences(para);
  if (paraSentences.length < 2 || paraSentences.length > 5) return fail("structure", `${paraSentences.length} sentences`);
  const parts = [one, ...paraSentences];
  for (const p of parts) if (/\b(?:you|your|yours|you're|you'd|you'll|you've)\b/i.test(p)) return fail("addresses_reader", p);
  for (const p of parts) {
    const g = checkScopeGuard(p);
    if (!g.passed) return fail("scope_guard", g.evidence ?? p);
  }
  // A year, a count, a percentage: each must be in the company's own text.
  const allowed = new Set([...extractNumbers(inputs.excerpt), ...extractNumbers(inputs.name)]);
  for (const p of parts) for (const n of extractNumbers(p)) if (!allowed.has(n)) return fail("number_not_in_source", `${n} in "${p}"`);
  for (const p of parts) {
    const m = p.match(FUTURE_CLAIM);
    if (m) return fail("future_claim", `${m[0]} in "${p}"`);
  }
  for (const p of parts) {
    const m = p.match(UNSOURCED_CLAIM);
    if (m) return fail("unsourced_claim", `${m[0]} in "${p}"`);
  }
  for (const p of parts) {
    const j = unexplainedJargon(p);
    if (j) return fail("unexplained_jargon", `${j} in "${p}"`);
  }
  for (const p of parts) if (wordCount(p) > MAX_SENTENCE_WORDS) return fail("sentence_too_long", p);
  return { passed: true, reason: null };
}

// ----------------------------------------------------------------- template

const DESCRIBES = /\b(?:is\s+(?:a|an|the)|designs|develops|makes|manufactures|sells|provides|operates|offers|owns|builds|produces|markets|distributes)\b/i;
/** Longest quoted sentence: a 10-K opening sentence is often long, but not a page. */
const MAX_QUOTE_WORDS = 60;

/**
 * The company's own first descriptive sentence from the excerpt: the first
 * sentence that names it (or says "we"/"the Company") and says what it is or
 * does. Null when none is found.
 */
export function firstDescriptiveSentence(excerpt: string, name: string): string | null {
  const short = name.replace(/,?\s+(?:Inc|Corp|Corporation|Company|Co|Ltd|Holdings|Group|plc|N\.V|S\.A)\.?$/i, "").trim();
  const nameRe = new RegExp(`\\b(?:${short.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}|we|the company|the corporation)\\b`, "i");
  for (const para of excerpt.split("\n")) {
    for (const s of sentences(para)) {
      const words = wordCount(s);
      if (words < 6 || words > MAX_QUOTE_WORDS) continue;
      if (!/[.!]$/.test(s) || /\b(?:refer to|see\s+(?:part|item|note)|forward-looking|incorporated by reference|unless (?:otherwise|the context))\b/i.test(s)) continue;
      if (nameRe.test(s) && DESCRIBES.test(s)) return s;
    }
  }
  return null;
}

/**
 * Cairn's own words when no checked model text exists: the SEC's industry
 * classification, and the company's own first descriptive sentence, quoted
 * and marked as the company's words.
 */
export function templateDescription(inputs: DescriptionInputs): DescriptionText {
  const oneLiner = inputs.sicDescription
    ? `The SEC classifies ${inputs.name} under “${inputs.sicDescription}”.`
    : `${inputs.name} files annual reports with the SEC.`;
  const quote = firstDescriptiveSentence(inputs.excerpt, inputs.name);
  const paragraph = quote
    ? `In its latest 10-K annual report, the company describes itself in its own words: “${quote}”`
    : "Its latest 10-K annual report did not open with a short self-description Cairn could quote; the full text is linked below.";
  return { oneLiner, paragraph };
}

// --------------------------------------------------------------- generation

export const DESCRIPTION_SYSTEM_PROMPT = `You explain in plain English what a company does, for everyday investors.

You are given the opening of the company's own annual report (the "Business" section of its 10-K). Write:
- "oneLiner": ONE sentence, under 20 words: what it sells and who buys it.
- "paragraph": 2 to 4 short sentences adding its main products or services and its main kinds of customers.

Hard rules, no exceptions:
- Use ONLY facts stated in the text you are given. If the text does not say who the customers are, do not guess.
- No numbers unless the same number appears in the text, written the same way.
- Plain English a 12-year-old can follow. Every sentence under 20 words. No finance or industry jargon; if a technical
  word is unavoidable, explain it in brackets right after it.
- Describe the present only. Nothing about plans, expectations, strategy, the future or what it "will" do.
- No praise or rank: never "leading", "largest", "best", "pioneer", "innovative" or similar, even if the text says so.
- Never address the reader ("you") and never say or hint what anyone should do, including buying or selling its shares.
Return JSON: {"oneLiner": string, "paragraph": string}`;

export type DescriptionCompleter = (req: { system: string; user: string }) => Promise<DescriptionText | null>;

function isDescriptionText(v: unknown): v is DescriptionText {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.oneLiner === "string" && typeof o.paragraph === "string";
}

async function defaultCompleter(req: { system: string; user: string }): Promise<DescriptionText | null> {
  const { llmCompleteJson } = await import("@/lib/ai/llm");
  return llmCompleteJson<DescriptionText>(
    {
      system: req.system,
      messages: [{ role: "user", content: req.user }],
      maxTokens: 400,
      temperature: 0.2,
      schemaName: "business_description",
      jsonSchema: {
        type: "object",
        additionalProperties: false,
        required: ["oneLiner", "paragraph"],
        properties: { oneLiner: { type: "string" }, paragraph: { type: "string" } },
      },
    },
    isDescriptionText,
  );
}

function fromTemplate(inputs: DescriptionInputs, failure: DescriptionFailure, evidence?: string): Description {
  return { ...templateDescription(inputs), source: "template", failure, evidence };
}

export async function generateDescription(inputs: DescriptionInputs, complete: DescriptionCompleter = defaultCompleter): Promise<Description> {
  if (!inputs.excerpt.trim()) return fromTemplate(inputs, "no_source");
  let out: DescriptionText | null;
  try {
    out = await complete({ system: DESCRIPTION_SYSTEM_PROMPT, user: JSON.stringify({ company: inputs.name, business_section: inputs.excerpt }) });
  } catch (err) {
    return fromTemplate(inputs, "model_error", err instanceof Error ? err.message.slice(0, 200) : String(err));
  }
  if (!out || !isDescriptionText(out)) return fromTemplate(inputs, "model_unusable");
  const text = { oneLiner: out.oneLiner.trim(), paragraph: out.paragraph.trim() };
  const check = checkDescription(text, inputs);
  if (!check.passed) return fromTemplate(inputs, check.reason!, check.evidence);
  return { ...text, source: "model", failure: null };
}

// ------------------------------------------------------------ revenue split

export interface SegmentRow {
  axis: "business_segment" | "product_or_service";
  label: string;
  revenue: number;
  total: number;
  fiscal_year_end: string;
  accn: string;
  filed: string | null;
}

export interface RevenueSplitView {
  axis: "business_segment" | "product_or_service";
  title: string;
  fiscalYearEnd: string;
  accn: string;
  filed: string | null;
  segments: { label: string; revenue: number; share: number; display: string }[];
}

/** Whole percent, with "<1%" for a sliver so a real segment never reads "0%". */
export function sharePct(share: number): string {
  if (share > 0 && share < 0.005) return "<1%";
  return `${Math.round(share * 100)}%`;
}

/** Stored segment rows -> the splits shown, latest fiscal year only, business segments first. */
export function revenueSplits(rows: SegmentRow[]): RevenueSplitView[] {
  if (rows.length === 0) return [];
  const latest = rows.map((r) => r.fiscal_year_end).sort().pop()!;
  const out: RevenueSplitView[] = [];
  for (const axis of ["business_segment", "product_or_service"] as const) {
    const list = rows.filter((r) => r.axis === axis && r.fiscal_year_end === latest).sort((a, b) => b.revenue - a.revenue);
    if (list.length < 2) continue;
    out.push({
      axis,
      title: axis === "business_segment" ? "Revenue by business segment" : "Revenue by product or service",
      fiscalYearEnd: latest,
      accn: list[0].accn,
      filed: list[0].filed,
      segments: list.map((r) => {
        const share = Number(r.revenue) / Number(r.total);
        return { label: r.label, revenue: Number(r.revenue), share, display: sharePct(share) };
      }),
    });
  }
  return out;
}
