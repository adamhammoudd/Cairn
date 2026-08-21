import { createClient } from "@/lib/supabase/server";
import { runChatTurn, type ChatHistoryMessage } from "@/lib/ai/chat-generate";
import { checkChatUsageAllowed, recordChatUsage } from "@/lib/actions/billing";
import { BUSY_MESSAGE, LlmBusyError } from "@/lib/ai/llm";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { sessionId, message } = (await req.json()) as { sessionId: string; message: string };
  if (!sessionId || !message?.trim()) return new Response("Missing sessionId or message", { status: 400 });

  // Verify the session belongs to this user. Scoped on user_id here rather
  // than left to RLS: the authorization decision belongs in the route, and the
  // policy is the backstop (see supabase/tests/rls_idor.sql).
  const { data: session } = await supabase
    .from("chat_sessions")
    .select("id, title, use_portfolio_context")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!session) return new Response("Chat session not found", { status: 404 });

  const gate = await checkChatUsageAllowed(user.id);
  if (!gate.allowed) return new Response(gate.message ?? "Daily chat limit reached.", { status: 429 });

  // Fetched before the insert below, so it's prior turns only - runChatTurn
  // builds the current turn's content itself (grounding context + question).
  //
  // Newest-first at the DB so the LIMIT keeps the most *recent* 20 turns, then
  // reversed back to chronological order for the model. Ordering ascending
  // under a LIMIT returned the oldest 20 instead: past twenty messages the
  // assistant re-read the opening of the conversation on every turn and never
  // saw anything recent, which reads as the model forgetting what was just
  // said. Same defect class as the ticker/compare stale-price bug.
  const { data: recentHistoryDesc } = await supabase
    .from("chat_messages")
    .select("role, content")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(20);
  const priorHistory = (recentHistoryDesc ?? []).slice().reverse();

  // NOTE: the user's message is deliberately NOT written here. It used to be,
  // and when generation then failed the route 500'd with the user turn already
  // committed - history reloaded showing a question with no answer, which reads
  // as the assistant having silently dropped it. The turn is now persisted as a
  // unit, after generation succeeds (below), so a failed turn leaves nothing
  // behind to explain. `priorHistory` above is prior-turns-only either way.

  // Hard gate: runChatTurn buffers the full model response, runs the scope
  // guard, and rewrites it if flagged - nothing unvalidated leaves this call.
  // Compare to the old implementation, which streamed raw model output
  // straight to the client and only ran the guard afterward as a post-hoc,
  // non-blocking audit.
  // Per-conversation override wins; null falls back to the account-level
  // Settings > AI Assistant preference, which itself defaults to on.
  const { data: settings } = await supabase
    .from("user_settings")
    .select("assistant_use_portfolio_context")
    .eq("user_id", user.id)
    .maybeSingle();
  const usePortfolioContext =
    session.use_portfolio_context ?? settings?.assistant_use_portfolio_context ?? true;

  let result: Awaited<ReturnType<typeof runChatTurn>>;
  try {
    result = await runChatTurn({
      userId: user.id,
      message,
      history: priorHistory as ChatHistoryMessage[],
      usePortfolioContext,
    });
  } catch (err) {
    // Provider rate-limited or overloaded us past the retry budget. The user
    // gets the plain "try again shortly" line, never the provider's raw error;
    // 503 + Retry-After is the honest status for "ask again later".
    if (err instanceof LlmBusyError) {
      console.error("[chat] provider unavailable:", err.message);
      return new Response(BUSY_MESSAGE, { status: 503, headers: { "Retry-After": "20" } });
    }
    // Anything else is a real fault. Still no raw internals to the client, and
    // still nothing persisted - the turn simply did not happen.
    console.error("[chat] turn failed:", err);
    return new Response("The assistant could not complete that request. Nothing was saved - please try again.", {
      status: 500,
    });
  }

  // Both halves of the turn land together, so history can never hold a user
  // message without its reply.
  await supabase.from("chat_messages").insert([
    { session_id: sessionId, role: "user", content: message, referenced_analysis_ids: [] },
    {
      session_id: sessionId,
      role: "assistant",
      content: result.displayText,
      referenced_analysis_ids: result.analysisIds,
    },
  ]);

  // First message in a session titles it, so chat history has something more
  // useful to list/search than a bare timestamp. After the insert for the same
  // reason: a session that never got a turn should not look like it did.
  if (!session.title) {
    await supabase
      .from("chat_sessions")
      .update({ title: message.trim().slice(0, 60) })
      .eq("id", sessionId);
  }

  // Only successful turns count against the daily allowance.
  await recordChatUsage(user.id);

  const encoder = new TextEncoder();
  const CHUNK_SIZE = 24;

  // The text below is already fully validated (and rewritten, if flagged) by
  // this point. Chunking is purely for a responsive typing-style UI via the
  // client's existing incremental-render loop - it is not, and cannot be, a
  // vector for unvalidated content, since nothing reaches this stream until
  // runChatTurn has already returned.
  const body = new ReadableStream({
    start(controller) {
      for (let i = 0; i < result.displayText.length; i += CHUNK_SIZE) {
        controller.enqueue(encoder.encode(result.displayText.slice(i, i + CHUNK_SIZE)));
      }
      // Trailing sentinel carrying the analyses actually offered as context this
      // turn, so the client can render the same MethodologyCard used everywhere
      // else - never parsed as visible text (stripped client-side before display).
      if (result.analysisIds.length > 0) {
        controller.enqueue(encoder.encode(` CAIRN_REFS:${JSON.stringify(result.analysisIds)}`));
      }
      controller.close();
    },
  });

  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
