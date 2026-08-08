"use client";

import { useEffect, useRef, useState } from "react";
import { createChatSession, listChatSessions, listChatMessages } from "@/lib/actions/chat";
import { getAnalysesByIds, type AnalysisWithMethodology } from "@/lib/actions/analysis";
import { MethodologyCard } from "@/components/analysis/methodology-card";
import { Disclosure } from "@/components/compliance/disclosure";

interface Message {
  role: "user" | "assistant";
  content: string;
  analyses?: AnalysisWithMethodology[];
}

const REFS_MARKER = /\sCAIRN_REFS:(\[[^\]]*\])$/;

function splitRefs(raw: string): { text: string; ids: string[] } {
  const match = raw.match(REFS_MARKER);
  if (!match) return { text: raw, ids: [] };
  try {
    return { text: raw.slice(0, match.index), ids: JSON.parse(match[1]) };
  } catch {
    return { text: raw, ids: [] };
  }
}

export function ChatThread({ compact = false }: { compact?: boolean }) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const sessions = await listChatSessions();
      if (sessions.length > 0) {
        setSessionId(sessions[0].id);
        const history = await listChatMessages(sessions[0].id);
        const withAnalyses = await Promise.all(
          history.map(async (m) => ({
            role: m.role,
            content: m.content,
            analyses:
              m.referenced_analysis_ids.length > 0 ? await getAnalysesByIds(m.referenced_analysis_ids) : undefined,
          })),
        );
        setMessages(withAnalyses);
      } else {
        const created = await createChatSession();
        setSessionId(created.id);
      }
    })();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || !sessionId || streaming) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }, { role: "assistant", content: "" }]);
    setStreaming(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message: text }),
      });

      if (!res.body) throw new Error("No response stream.");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let raw = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        raw += decoder.decode(value, { stream: true });
        const { text: displayText } = splitRefs(raw);
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: "assistant", content: displayText };
          return next;
        });
      }

      const { ids } = splitRefs(raw);
      if (ids.length > 0) {
        const analyses = await getAnalysesByIds(ids);
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { ...next[next.length - 1], analyses };
          return next;
        });
      }
    } catch {
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = { role: "assistant", content: "Something went wrong. Try again." };
        return next;
      });
    } finally {
      setStreaming(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className={`flex-1 overflow-y-auto ${compact ? "px-3 py-3" : "px-2 py-4"}`}>
        {messages.length === 0 ? (
          <p className="text-[13px] text-muted">
            Ask about a ticker, sector, or market trend — I&apos;ll answer from stored research only.
          </p>
        ) : (
          <div className="flex flex-col gap-3.5">
            {messages.map((m, i) => (
              <div key={i} className={`flex flex-col gap-2 ${m.role === "user" ? "items-end" : "items-start"}`}>
                <div
                  className={`max-w-[88%] rounded-xl px-4 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-wrap ${
                    m.role === "user" ? "bg-active text-primary" : "border border-line bg-panel text-primary"
                  }`}
                >
                  {m.content || (streaming && i === messages.length - 1 ? "…" : "")}
                </div>
                {m.analyses && m.analyses.length > 0 && (
                  <div className="flex w-[92%] flex-col gap-2">
                    {m.analyses.map((a) => (
                      <MethodologyCard key={a.id} analysis={a} compact />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-line p-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask about NVDA, semiconductors, the market…"
          disabled={streaming}
          className="flex-1 rounded-lg border border-line bg-active px-3 py-2 text-[13.5px] text-primary outline-none disabled:opacity-60"
        />
        <button
          type="button"
          onClick={send}
          disabled={streaming || !input.trim()}
          className="rounded-lg px-3.5 py-2 text-[13px] font-semibold text-canvas disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, #5EE6A6, #22B573)" }}
        >
          Send
        </button>
      </div>
      <div className="px-3 pb-2">
        <Disclosure />
      </div>
    </div>
  );
}
