// The chat surface's generate-then-validate core, extracted out of
// app/api/chat/route.ts so it (a) has no HTTP/session/streaming concerns and
// is directly callable from the Section 7 test suite, and (b) is the single
// place the hard scope-guard gate runs for chat - nothing produced here
// leaves this function until it has already passed or been rewritten.
//
// Mirrors lib/ai/generate.ts's validate-before-storage discipline: that
// module blocks before inserting into ai_analyses; this one blocks before
// any text is streamed to a client or written to chat_messages. Callers
// (route.ts, the test suite) never see raw, unvalidated model output.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildChatContext, type ChatContext } from "@/lib/ai/context";
import { checkScopeGuard, checkNoFreelancedProbability, rewriteForScopeGuard } from "@/lib/ai/scope-guard";
import { classifyScope, classifierMode, resolveUnavailable } from "@/lib/ai/scope-classifier";
import { llmComplete } from "@/lib/ai/llm";
import { normalizeReply } from "@/lib/ai/reply-format";
import type { Database } from "@/lib/supabase/types";

const SYSTEM_PROMPT = `You are Cairn's conversational research assistant. You answer questions about
markets, sectors, and tickers using ONLY the stored analyses and news items provided in each turn's
context block below - you never invent a new probability, percentage, or confidence figure of your
own. If the provided context doesn't cover the question, say so plainly and suggest the person
request a fresh analysis on the Research page - do not guess or estimate a number yourself.

Hard rules, no exceptions:
- Never phrase anything as a personal directive ("you should buy/sell/hold", "consider trimming",
  "add to your position"). The user's holdings/watchlist are used only to decide which stored
  analyses are relevant to surface - never to shape advice about their specific position.
- When you cite a stored analysis, keep its probability range and confidence level as given -
  don't round it into false precision or restate it more confidently than it was stored.
- Plain language, cite sources/analogs when you reference them.

How the answer must be written:
- The chat bubble renders markdown. You MAY use **bold** for the key figure or
  finding, short bulleted or numbered lists when you are genuinely enumerating
  parallel points, a single short "## Sub-heading" only when the answer really
  has two distinct sections, and [label](url) links for sources you name. Do
  NOT use tables or pipe "|" characters - the column is too narrow and they are
  flattened out anyway. Do not decorate a one-idea answer with structure it
  doesn't need.
- Concise: aim for two short paragraphs, ~40-110 words. A list may replace a
  paragraph but keep it to 2-4 items. If the answer will not fit, the excess is
  detail that belongs in the analysis card, not the reply.
- Lead with the direct answer and its concrete figures - the actual range, the
  actual move, the actual percentage. No preamble about what you do or do not
  have on file.
- Don't recite headlines one by one as prose. If you are surfacing several, a
  short bullet list with each source linked is fine; otherwise say what they
  collectively indicate in a sentence.
- When stored analyses are attached to this turn, close by pointing to the card
  beneath the reply instead of restating its numbers, e.g. "Below is the
  market-level probability context for the move, with its inputs shown."
- News items and stored analyses are separate. If news items are present but no
  stored analysis is, do NOT say you have nothing - give one or two sentences on
  what those items collectively indicate, then note in the same breath that a
  probability range needs a fresh analysis on the Research page. Claim nothing
  is available only when both are empty, and then in ONE sentence naming what
  would answer it. Not a paragraph, and never an apology.

This is the shape and length expected:

Your portfolio is up **1.24%** today - $1,417 on $115,686. NVDA (+2.8%) and AMD
(+3.2%) contributed nearly all of it; VTI is the only drag at -0.21%.

AMD remains your one position underwater on cost basis, -11.0% against an
average entry of $189.20. Below is the market-level probability context for the
NVDA move, with its inputs shown.`;

export interface ChatHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatTurnInput {
  userId: string;
  message: string;
  /** Prior turns only - must NOT include the current `message`. */
  history: ChatHistoryMessage[];
  /**
   * Optional override for the request-scoped Supabase client that
   * buildChatContext otherwise creates itself - needed by callers with no
   * Next.js request scope (the Section 7 test suite passes an admin client).
   * Real HTTP requests (app/api/chat/route.ts) leave this unset.
   */
  supabaseClient?: SupabaseClient<Database>;
  /**
   * Marks any resulting ai_scope_guard_log row as test-originated. That table
   * is the compliance audit trail, so synthetic violations from the
   * adversarial suite must be distinguishable from ones a real user's turn
   * produced. Only the test harness sets this.
   */
  isTest?: boolean;
  /**
   * Settings > AI Assistant "Portfolio context", or the per-conversation
   * override on chat_sessions. Off means holdings/watchlists are not read when
   * choosing which stored analyses and news are relevant. It never widens what
   * the assistant may say - the scope guard still rejects anything that
   * resolves to advice about a personal position, on either setting.
   */
  usePortfolioContext?: boolean;
}

export interface ChatTurnResult {
  /** Validated (and rewritten, if flagged) text - the only thing safe to store or show. */
  displayText: string;
  flagged: boolean;
  flagReason: string | null;
  /** Raw model output - kept only for the audit log, never shown to the user when flagged. */
  rawOutput: string;
  analysisIds: string[];
  context: ChatContext;
}

function buildContextBlock(context: ChatContext): string {
  // The card-attached line is stated as a fact about this turn, not left for
  // the model to infer from an empty array. It got this wrong when it was only
  // implied: with zero analyses it still wrote "Below is the market-level
  // probability context...", pointing the user at a card that was not rendered.
  const cardNote =
    context.analyses.length === 0
      ? "NO analysis card is rendered beneath your reply this turn. Do NOT write \"Below is...\" or refer to anything shown below - there is nothing there."
      : `An analysis card IS rendered beneath your reply this turn (${context.analyses.length}). Close by pointing to it instead of restating its numbers.`;

  return `Context for this turn (stored, already-validated data - do not invent beyond this):

${cardNote}

Relevant stored analyses:
${context.analyses.length === 0 ? "(none found)" : JSON.stringify(context.analyses, null, 2)}

Relevant recent news:
${context.news.length === 0 ? "(none found)" : JSON.stringify(context.news, null, 2)}`;
}

export async function runChatTurn({
  userId,
  message,
  history,
  supabaseClient,
  isTest = false,
  usePortfolioContext = true,
}: ChatTurnInput): Promise<ChatTurnResult> {
  const context = await buildChatContext(message, userId, supabaseClient, usePortfolioContext);
  const contextBlock = buildContextBlock(context);

  const rawOutput = await llmComplete({
    system: SYSTEM_PROMPT,
    maxTokens: 1024,
    messages: [
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: `${contextBlock}\n\nQuestion: ${message}` },
    ],
  });

  const analysisIds = context.analyses.map((a) => a.id);

  const scopeCheck = checkScopeGuard(rawOutput);
  const probabilityCheck = checkNoFreelancedProbability(rawOutput, context.analyses);
  let failure = !scopeCheck.passed ? scopeCheck : !probabilityCheck.passed ? probabilityCheck : null;

  // Layer 3: semantic second pass. Only consulted when the deterministic
  // layers found nothing -- if they already flagged, the response is being
  // rewritten regardless and a model round-trip would only add latency.
  let classifierNote: string | null = null;
  if (!failure) {
    const verdict = await classifyScope(rawOutput);
    if (verdict.status === "flagged") {
      failure = { passed: false, reason: verdict.reason, evidence: verdict.rationale };
    } else if (verdict.status === "unavailable") {
      const resolution = resolveUnavailable(classifierMode(), verdict.detail);
      classifierNote = resolution.note;
      if (resolution.blocked) {
        failure = { passed: false, reason: "classifier_unavailable_strict_mode", evidence: verdict.detail };
      }
    }
  }

  if (!failure) {
    // Formatting only - the guard above ran on rawOutput, and normalizeReply
    // only flattens pipe tables (no wording change), so the check it just
    // passed still describes what the user sees. rawOutput is stored and
    // logged unmodified; the bubble renders the markdown.
    return { displayText: normalizeReply(rawOutput), flagged: false, flagReason: null, rawOutput, analysisIds, context };
  }

  const corrected = rewriteForScopeGuard(context.analyses);
  const admin = createAdminClient();
  await admin.from("ai_scope_guard_log").insert({
    raw_output: rawOutput,
    corrected_output: corrected,
    flagged: true,
    flag_reason: `chat:${failure.reason}`,
    source_surface: "chat",
    is_test: isTest,
  });

  if (classifierNote) console.warn(`[scope-guard] ${classifierNote}`);

  return { displayText: corrected, flagged: true, flagReason: failure.reason, rawOutput, analysisIds, context };
}
