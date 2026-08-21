// Prints what the assistant actually replies, through the real production path.
//
// runChatTurn is the same function app/api/chat/route.ts calls - same system
// prompt, same context builder, same scope guard, same formatter. The only
// difference is that the Supabase client is the admin one, which the Tier B
// suite already does, because a script has no HTTP request scope.
//
// This exists because the reply FORMAT is a product surface with no automated
// judge: the unit suite proves the formatter strips markdown, but only reading
// a real answer shows whether it reads like the mock-up's two short paragraphs
// or like a research dump. Marked isTest so any scope-guard row it produces
// stays out of the real compliance audit trail.
//
// Run: npx tsx --conditions=react-server scripts/reply-preview.ts "your question"
import "./tests/env";
import { randomUUID } from "node:crypto";

async function main() {
  const question = process.argv[2] ?? "what do you think about nvidia";

  const { runChatTurn } = await import("@/lib/ai/chat-generate");
  const { createAdminClient } = await import("@/lib/supabase/admin");

  const started = Date.now();
  const result = await runChatTurn({
    userId: randomUUID(),
    message: question,
    history: [],
    supabaseClient: createAdminClient(),
    isTest: true,
  });

  const words = result.displayText.trim().split(/\s+/).length;
  console.log(`Q: ${question}`);
  console.log(`latency_ms: ${Date.now() - started} · words: ${words} · flagged: ${result.flagged}`);
  console.log(`analyses attached: ${result.analysisIds.length}`);
  console.log("---");
  console.log(result.displayText);
  console.log("---");
  // The two defects seen in the browser, checked mechanically so a regression
  // is obvious without re-reading the prose every time.
  console.log(`contains "|": ${result.displayText.includes("|")}`);
  console.log(`contains "**": ${result.displayText.includes("**")}`);
}

main();
