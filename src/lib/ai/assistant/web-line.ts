// The "Searched the web" line under an answer (audit 2026-10-02, item 3.5).
// Pure, so the wording and the rule (shown exactly when a search ran) are tested.

import type { AssistantMeta } from "@/lib/ai/assistant/types";

const PROVIDER_NAME: Record<"groq" | "brave", string> = { groq: "Groq", brave: "Brave Search" };

export function webSearchLine(meta: Pick<AssistantMeta, "usage" | "webProvider">): string | null {
  const n = meta.usage?.webSearches ?? 0;
  if (n <= 0) return null;
  const who = meta.webProvider ? PROVIDER_NAME[meta.webProvider] : "a web search provider";
  return n === 1
    ? `Searched the web for this answer. The search words were sent to ${who}.`
    : `Searched the web ${n} times for this answer. The search words were sent to ${who}.`;
}
