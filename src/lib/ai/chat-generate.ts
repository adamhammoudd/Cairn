// The chat surface's generate-then-validate core, extracted out of
// app/api/chat/route.ts so it (a) has no HTTP/session/streaming concerns and
// is directly callable from the Section 7 test suite, and (b) is the single
// place the hard scope-guard gate runs for chat — nothing produced here
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
import { llmComplete } from "@/lib/ai/llm";
import type { Database } from "@/lib/supabase/types";

const SYSTEM_PROMPT = `You are Cairn's conversational research assistant. You answer questions about
markets, sectors, and tickers using ONLY the stored analyses and news items provided in each turn's
context block below — you never invent a new probability, percentage, or confidence figure of your
own. If the provided context doesn't cover the question, say so plainly and suggest the person
request a fresh analysis on the Research page — do not guess or estimate a number yourself.

Hard rules, no exceptions:
- Never phrase anything as a personal directive ("you should buy/sell/hold", "consider trimming",
  "add to your position"). The user's holdings/watchlist are used only to decide which stored
  analyses are relevant to surface — never to shape advice about their specific position.
- When you cite a stored analysis, keep its probability range and confidence level as given —
  don't round it into false precision or restate it more confidently than it was stored.
- Plain language, cite sources/analogs when you reference them.`;

export interface ChatHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatTurnInput {
  userId: string;
  message: string;
  /** Prior turns only — must NOT include the current `message`. */
  history: ChatHistoryMessage[];
  /**
   * Optional override for the request-scoped Supabase client that
   * buildChatContext otherwise creates itself — needed by callers with no
   * Next.js request scope (the Section 7 test suite passes an admin client).
   * Real HTTP requests (app/api/chat/route.ts) leave this unset.
   */
  supabaseClient?: SupabaseClient<Database>;
}

export interface ChatTurnResult {
  /** Validated (and rewritten, if flagged) text — the only thing safe to store or show. */
  displayText: string;
  flagged: boolean;
  flagReason: string | null;
  /** Raw model output — kept only for the audit log, never shown to the user when flagged. */
  rawOutput: string;
  analysisIds: string[];
  context: ChatContext;
}

function buildContextBlock(context: ChatContext): string {
  return `Context for this turn (stored, already-validated data — do not invent beyond this):

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
}: ChatTurnInput): Promise<ChatTurnResult> {
  const context = await buildChatContext(message, userId, supabaseClient);
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
  const failure = !scopeCheck.passed ? scopeCheck : !probabilityCheck.passed ? probabilityCheck : null;

  if (!failure) {
    return { displayText: rawOutput, flagged: false, flagReason: null, rawOutput, analysisIds, context };
  }

  const corrected = rewriteForScopeGuard(context.analyses);
  const admin = createAdminClient();
  await admin.from("ai_scope_guard_log").insert({
    raw_output: rawOutput,
    corrected_output: corrected,
    flagged: true,
    flag_reason: `chat:${failure.reason}`,
    source_surface: "chat",
  });

  return { displayText: corrected, flagged: true, flagReason: failure.reason, rawOutput, analysisIds, context };
}
