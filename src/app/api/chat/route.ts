import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { MAX_CHAT_MESSAGE_CHARS } from "@/lib/ai/chat-generate";
import { getUserPlan } from "@/lib/actions/billing";
import { checkChatUsageAllowed, recordChatUsage } from "@/lib/chat-usage";
import { getDisplayPrefs } from "@/lib/actions/display-prefs";
import { rateLimit, sweepRateLimits } from "@/lib/rate-limit";
import { BUSY_MESSAGE, LlmBusyError } from "@/lib/ai/llm";
import { runAssistantTurn } from "@/lib/ai/assistant/agent";
import { liveAssistantData } from "@/lib/ai/assistant/data";
import { encodeEvent, type ChatStreamEvent } from "@/lib/ai/assistant/stream";

// Per-user burst limit, independent of the daily chat quota. Premium's daily
// quota is unlimited, and even Free's is a day-scale number - neither stops one
// session from looping this endpoint fast enough to drain the shared per-day
// model token budget for every user at once (audit 2026-09-04 #12). ~1 message
// every 4-5s sustained is well above any real conversation.
const CHAT_BURST_LIMIT = 12;
const CHAT_BURST_WINDOW_MS = 60_000;

// Assistant v2 (feat/assistant-v2). The answer is built by a tool-using agent
// (lib/ai/assistant/agent.ts) from live, server-side reads, guarded, and only
// then persisted and streamed. The response is newline-delimited JSON events
// (lib/ai/assistant/stream.ts): "activity" lines while tools run, then the
// validated text in chunks, then the tiles/sources/follow-ups. Nothing
// unvalidated is ever sent: activity events carry tool labels only, and the
// text is streamed after runAssistantTurn has returned.
//
// There is no chat-triggered analysis generation any more. It used to run
// runAnalysisGeneration for a ticker with nothing stored - spending one of the
// reader's monthly analyses on a chat question, and dead-ending young symbols.
// get_history_outcome now answers "what history says" live, without storing
// anything or touching the analysis quota.

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  sweepRateLimits();
  const burst = rateLimit(`chat:${user.id}`, CHAT_BURST_LIMIT, CHAT_BURST_WINDOW_MS);
  if (!burst.allowed) {
    return new Response("You're sending messages too quickly. Wait a moment and try again.", {
      status: 429,
      headers: { "Retry-After": String(burst.retryAfterSec) },
    });
  }

  const { sessionId, message } = (await req.json()) as { sessionId: string; message: string };
  if (!sessionId || !message?.trim()) return new Response("Missing sessionId or message", { status: 400 });
  if ([...message].length > MAX_CHAT_MESSAGE_CHARS) {
    return new Response(`Message is too long - keep it under ${MAX_CHAT_MESSAGE_CHARS} characters.`, { status: 400 });
  }

  // Scoped on user_id here rather than left to RLS: the authorization decision
  // belongs in the route, and the policy is the backstop.
  const { data: session } = await supabase
    .from("chat_sessions")
    .select("id, title, use_portfolio_context")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!session) return new Response("Chat session not found", { status: 404 });

  const gate = await checkChatUsageAllowed();
  if (!gate.allowed) return new Response(gate.message ?? "Daily chat limit reached.", { status: 429 });

  // Newest-first at the DB so the LIMIT keeps the most recent turns, then
  // reversed to chronological order for the model.
  const { data: recentHistoryDesc } = await supabase
    .from("chat_messages")
    .select("role, content")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(12);
  const history = (recentHistoryDesc ?? []).slice().reverse() as { role: "user" | "assistant"; content: string }[];

  // Per-conversation override wins; null falls back to the account-level
  // Settings > AI Assistant preference (default on). This replaces the old
  // global ENABLE_PORTFOLIO_CONTEXT env gate.
  const [{ data: settings }, plan, prefs] = await Promise.all([
    supabase.from("user_settings").select("assistant_use_portfolio_context").eq("user_id", user.id).maybeSingle(),
    getUserPlan(),
    getDisplayPrefs(),
  ]);
  const usePortfolio = session.use_portfolio_context ?? settings?.assistant_use_portfolio_context ?? false;

  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      const send = (e: ChatStreamEvent) => controller.enqueue(encoder.encode(encodeEvent(e)));
      try {
        const result = await runAssistantTurn({
          message,
          history,
          ctx: { data: liveAssistantData({ supabase, userId: user.id, prefs }), plan: plan === "premium" ? "premium" : "free", prefs, usePortfolio },
          onActivity: (label) => send({ t: "activity", label }),
        });

        // Both halves of the turn land together, so history can never hold a
        // user message without its reply. meta is written only where the
        // column exists (migration 0059), so a deploy ahead of the migration
        // still saves the answer text.
        type MessageInsert = Database["public"]["Tables"]["chat_messages"]["Insert"];
        const rows: MessageInsert[] = [
          { session_id: sessionId, role: "user", content: message, referenced_analysis_ids: [] },
          { session_id: sessionId, role: "assistant", content: result.markdown, referenced_analysis_ids: result.analysisIds, meta: result.meta as unknown as Record<string, unknown> },
        ];
        let { error: insertError } = await supabase.from("chat_messages").insert(rows);
        if (insertError && /meta/.test(insertError.message)) {
          ({ error: insertError } = await supabase.from("chat_messages").insert(rows.map((r) => ({ ...r, meta: undefined }))));
        }
        if (insertError) throw new Error(`Saving the turn failed: ${insertError.message}`);

        if (!session.title) {
          await supabase.from("chat_sessions").update({ title: message.trim().slice(0, 60) }).eq("id", sessionId);
        }
        await recordChatUsage();

        console.info(`[assistant] turn cost $${result.meta.costUsd.toFixed(5)} (${result.meta.usage.calls} model calls, ${result.meta.usage.promptTokens}+${result.meta.usage.completionTokens} tokens, ${result.meta.usage.webSearches} web searches, source=${result.meta.source})`);

        // Chunked purely for a typing-style UI: all of it is already validated.
        for (let i = 0; i < result.markdown.length; i += 48) send({ t: "text", chunk: result.markdown.slice(i, i + 48) });
        send({ t: "meta", meta: result.meta });
        if (result.analysisIds.length > 0) send({ t: "refs", ids: result.analysisIds });
        send({ t: "done" });
      } catch (err) {
        // Nothing was persisted: the turn simply did not happen.
        if (err instanceof LlmBusyError) {
          console.error("[chat] provider unavailable:", err.message);
          send({ t: "error", message: BUSY_MESSAGE });
        } else {
          console.error("[chat] turn failed:", err);
          send({ t: "error", message: "The assistant could not complete that request. Nothing was saved - please try again." });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
