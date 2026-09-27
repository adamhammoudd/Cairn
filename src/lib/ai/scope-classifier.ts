// Layer 3 of the scope guard: a second-pass semantic classifier.
//
// Layers 1 and 2 (structural typing, and the compositional check in
// scope-guard.ts) are both surface-form reasoning. The compositional layer is
// a large improvement on phrase matching -- it went from catching 5 of 25
// natural paraphrases to 25 of 25 -- but it is still deciding from lexicons,
// and lexicons have edges. A model that has never seen either list can still
// wander outside them:
//
//   "Anyone still overweight the space is going to wish they weren't."
//
// No frame from the list, no action verb in base form, unmistakably advice.
// This layer exists for that residue: it asks a model to judge the *intent* of
// the text rather than its wording, and runs after generation and before the
// response reaches a user.
//
// --------------------------------------------------------------------------
// Failure posture
// --------------------------------------------------------------------------
// The classifier needs an inference server. When one is not reachable, the
// choice is between failing closed (block the response) and failing open
// (ship it on layers 1-2 alone). Failing closed on every outage takes the
// whole assistant down whenever the model host hiccups; failing open means a
// degraded guard during exactly that window.
//
// Default here is fail-open-and-log, because layers 1-2 are themselves a hard
// gate and the classifier is additive rather than the only thing standing
// between a directive and a user. SCOPE_CLASSIFIER_MODE=strict flips it to
// fail-closed for a deployment that would rather return an error than a
// possibly-unclassified response.
//
// That default is a judgement call with a compliance dimension, and it is
// flagged for chief-of-staff in docs/decisions/ rather than settled here.

import { llmCompleteJson, isLlmConfigured } from "@/lib/ai/llm";

export type ClassifierMode = "advisory" | "strict" | "off";

export type ClassifierOutcome =
  | { status: "clear" }
  | { status: "flagged"; reason: string; rationale: string }
  | { status: "unavailable"; detail: string };

export function classifierMode(): ClassifierMode {
  const raw = (process.env.SCOPE_CLASSIFIER_MODE || "advisory").toLowerCase();
  if (raw === "strict" || raw === "off") return raw;
  return "advisory";
}

const SYSTEM = `You are a compliance classifier for a market-analysis product. You do not answer questions and you do not give opinions about markets.

You are given one candidate response that the product is about to show a user. Decide whether it contains PERSONAL INVESTMENT DIRECTION.

Personal investment direction means the text tells the reader -- directly, by implication, by hypothetical, or by rhetorical question -- what they personally ought to do with money or with a position. It includes:
- telling the reader to buy, sell, hold, add, trim, rotate, hedge, exit, or wait
- recommending a course of action for "you", or for someone in the reader's situation
- describing what the writer would do in the reader's place
- evaluating the reader's own holdings, returns, or allocation
- steering via a leading question ("why not take some off the table here?")

It does NOT include:
- describing what a market, sector, or ticker has done or may do
- base rates, probabilities, historical analogs, and their confidence
- reporting what other market participants did ("funds rotated out of tech")
- declining to answer, or saying no data is available -- even if the refusal quotes the user's question back, and even if it mentions the reader's holdings while explaining what it cannot do
- stating facts the product computed about the reader's own holdings -- their value, weight in the portfolio, price change, gain or loss since bought, upcoming earnings or dividend dates, or a holding's scorecard levels -- as long as it does not judge them (good/bad, too big, too risky) or suggest what to do
- standard disclaimers

Judge intent, not vocabulary. A refusal that happens to contain the words "you should sell" because it is quoting the question is CLEAR. A sentence with no modal verb and no imperative is FLAGGED if its plain reading is an instruction to the reader.

Reply with JSON only: {"verdict":"clear"|"flagged","reason":"<short slug>","rationale":"<one sentence>"}`;

const SCHEMA = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: ["clear", "flagged"] },
    reason: { type: "string" },
    rationale: { type: "string" },
  },
  required: ["verdict", "reason", "rationale"],
  additionalProperties: false,
} as const;

interface ClassifierReply {
  verdict: "clear" | "flagged";
  reason: string;
  rationale: string;
}

export function isClassifierReply(v: unknown): v is ClassifierReply {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    (r.verdict === "clear" || r.verdict === "flagged") &&
    typeof r.reason === "string" &&
    typeof r.rationale === "string"
  );
}

/**
 * Interprets a classifier reply. Split out from the network call so the
 * decision logic is unit-testable without an inference server -- see
 * scripts/tests/scope-classifier.ts.
 */
export function interpretReply(reply: ClassifierReply): ClassifierOutcome {
  if (reply.verdict === "flagged") {
    return {
      status: "flagged",
      reason: `classifier:${reply.reason || "personal_direction"}`,
      rationale: reply.rationale,
    };
  }
  return { status: "clear" };
}

/**
 * Resolves an unavailable classifier into a pass/block decision according to
 * the configured mode. Also pure, also unit-tested.
 */
export function resolveUnavailable(mode: ClassifierMode, detail: string): { blocked: boolean; note: string } {
  if (mode === "strict") {
    return { blocked: true, note: `scope classifier unavailable and mode=strict: ${detail}` };
  }
  return { blocked: false, note: `scope classifier unavailable, allowed on layers 1-2 alone: ${detail}` };
}

export async function classifyScope(text: string): Promise<ClassifierOutcome> {
  if (classifierMode() === "off") return { status: "clear" };
  if (!isLlmConfigured()) {
    return { status: "unavailable", detail: "no LLM_BASE_URL/LLM_MODEL configured" };
  }

  try {
    const reply = await llmCompleteJson<ClassifierReply>(
      {
        system: SYSTEM,
        messages: [{ role: "user", content: text }],
        // Deterministic: this is a gate, and a gate that changes its mind
        // between identical inputs is not one.
        temperature: 0,
        maxTokens: 200,
        jsonSchema: SCHEMA as unknown as Record<string, unknown>,
        schemaName: "scope_verdict",
      },
      isClassifierReply,
    );
    return interpretReply(reply);
  } catch (err) {
    return { status: "unavailable", detail: err instanceof Error ? err.message : String(err) };
  }
}
