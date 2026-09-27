// The /api/chat wire format (feat/assistant-v2): one JSON object per line.
// Plain module so the route and the client component share it.

import type { AssistantMeta } from "@/lib/ai/assistant/types";

export type ChatStreamEvent =
  | { t: "activity"; label: string }
  | { t: "text"; chunk: string }
  | { t: "meta"; meta: AssistantMeta }
  | { t: "refs"; ids: string[] }
  | { t: "error"; message: string }
  | { t: "done" };

export function encodeEvent(e: ChatStreamEvent): string {
  return `${JSON.stringify(e)}\n`;
}

/**
 * Split a growing buffer into complete events plus the unfinished tail.
 * A malformed line is skipped rather than failing the whole turn.
 */
export function decodeEvents(buffer: string): { events: ChatStreamEvent[]; rest: string } {
  const lines = buffer.split("\n");
  const rest = lines.pop() ?? "";
  const events: ChatStreamEvent[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line) as ChatStreamEvent);
    } catch {
      // skip
    }
  }
  return { events, rest };
}
