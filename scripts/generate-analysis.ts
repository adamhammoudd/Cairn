// Generates one real analysis through the production path.
//
// This is what the Generate button on /ticker/<symbol> calls. It exists as a
// script because ai_analyses being empty blocks four separate verifications at
// once - the chat reply's analysis card, the methodology card's substance, the
// citation-freshness suite, and the Free vs Premium depth comparison - and none
// of them can be settled by reading code.
//
// It writes real rows (ai_analyses plus its source and analog join rows),
// exactly as the button does. Nothing here is synthetic: the probability is
// computed in code from real historical events, and the cited sources are the
// news rows actually fed to the prompt.
//
// Run: npx tsx --conditions=react-server scripts/generate-analysis.ts NVDA
//      npx tsx --conditions=react-server scripts/generate-analysis.ts BTC
import "./tests/env";

async function main() {
  const scopeValue = process.argv[2] ?? "NVDA";
  const scopeType = (process.argv[3] as "ticker" | "sector" | "market") ?? "ticker";

  const { generateAnalysis } = await import("@/lib/ai/generate");
  const { createAdminClient } = await import("@/lib/supabase/admin");

  const started = Date.now();
  const analysis = await generateAnalysis({
    scopeType,
    scopeValue,
    supabaseClient: createAdminClient(),
  });

  console.log(`generated in ${Date.now() - started}ms`);
  console.log(JSON.stringify(analysis, null, 2));
}

main().catch((err) => {
  // The interesting failures here are the pre-model gates (no analogs, no
  // tagged news), so surface the message rather than a stack.
  console.error(`generation failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
