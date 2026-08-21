// One-off live reachability check for the configured model provider.
//
// Section 1 of the AI spec asks for a real response as evidence, and every
// other blocked verification is downstream of "can we reach the provider at
// all". This answers that question and nothing else: it writes no rows and
// touches no user data, so it is safe to run before the pipeline is trusted.
//
// It exists because the first real failure in the wild was indistinguishable
// from a rate limit in the logs - a stale LLM_BASE_URL pointing at a local
// Ollama that was not running produced "fetch failed" with no URL attached.
// This prints the endpoint and the model it actually used.
//
// Run: npm run test:live
import "./tests/env";
import { llmHealthCheck, llmComplete, isLlmConfigured } from "@/lib/ai/llm";

async function main() {
  if (!isLlmConfigured()) {
    console.error("No provider configured: GROQ_API_KEY is unset in .env.local.");
    process.exit(1);
  }

  const health = await llmHealthCheck();
  console.log("health:", JSON.stringify(health));
  if (!health.ok) process.exit(1);

  const started = Date.now();
  const out = await llmComplete({
    system: "Reply in one short sentence.",
    messages: [{ role: "user", content: "Name the two largest US equity indices." }],
    maxTokens: 60,
  });
  console.log("latency_ms:", Date.now() - started);
  console.log("completion:", out.trim());
}

main();
