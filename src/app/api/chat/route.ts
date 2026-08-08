import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildChatContext } from "@/lib/ai/context";
import { checkScopeGuard } from "@/lib/ai/scope-guard";

const MODEL = "claude-opus-5";

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

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { sessionId, message } = (await req.json()) as { sessionId: string; message: string };
  if (!sessionId || !message?.trim()) return new Response("Missing sessionId or message", { status: 400 });

  // Verify the session belongs to this user (RLS would also block the insert, this gives a clean 404)
  const { data: session } = await supabase.from("chat_sessions").select("id").eq("id", sessionId).single();
  if (!session) return new Response("Chat session not found", { status: 404 });

  await supabase.from("chat_messages").insert({ session_id: sessionId, role: "user", content: message });

  const [{ data: history }, context] = await Promise.all([
    supabase
      .from("chat_messages")
      .select("role, content")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true })
      .limit(20),
    buildChatContext(message, user.id),
  ]);

  const contextBlock = `Context for this turn (stored, already-validated data — do not invent beyond this):

Relevant stored analyses:
${context.analyses.length === 0 ? "(none found)" : JSON.stringify(context.analyses, null, 2)}

Relevant recent news:
${context.news.length === 0 ? "(none found)" : JSON.stringify(context.news, null, 2)}`;

  const anthropicMessages = (history ?? []).map((m, i, arr) =>
    i === arr.length - 1 && m.role === "user"
      ? { role: "user" as const, content: `${contextBlock}\n\nQuestion: ${m.content}` }
      : { role: m.role, content: m.content },
  );

  const client = new Anthropic();
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: anthropicMessages,
  });

  const analysisIds = context.analyses.map((a) => a.id);
  const encoder = new TextEncoder();

  const body = new ReadableStream({
    async start(controller) {
      let full = "";
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            full += event.delta.text;
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
      } finally {
        controller.close();
        if (full.trim()) {
          await supabase
            .from("chat_messages")
            .insert({ session_id: sessionId, role: "assistant", content: full, referenced_analysis_ids: analysisIds });

          // Post-hoc audit only — the response is already streamed to the user by
          // this point, so a failed check here logs for review rather than blocking.
          const check = checkScopeGuard(full);
          if (!check.passed) {
            const admin = createAdminClient();
            await admin
              .from("ai_scope_guard_log")
              .insert({ raw_output: full, flagged: true, flag_reason: `chat:${check.reason}` });
          }
        }
      }
    },
  });

  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
