// Stand-in for src/lib/ai/llm.ts under scripts/harness/tsconfig.readonly.json.
// Everything is the real module except the three calls that reach a model
// provider, which fail at once: no network, no spend, deterministic. The
// analysis text then falls back to Cairn's own template, which must pass the
// same guards (lib/ai/analysis-text.ts) - so a harness run still exercises the
// number and source checks, just not the model's prose.
export * from "../../src/lib/ai/llm";
import type { LlmRequest } from "../../src/lib/ai/llm";

const off = () => new Error("mock LLM: model calls are disabled in the read-only harness");

export async function llmComplete(_req: LlmRequest): Promise<string> {
  throw off();
}

export async function llmCompleteJson<T>(_req: LlmRequest, _v: (p: unknown) => p is T): Promise<T> {
  throw off();
}

export async function llmCompleteJsonWithProvider<T>(_req: LlmRequest, _v: (p: unknown) => p is T): Promise<{ parsed: T; modelVersion: string }> {
  throw off();
}
