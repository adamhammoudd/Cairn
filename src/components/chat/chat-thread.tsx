"use client";

import { useEffect, useRef, useState } from "react";
import { createChatSession, listChatSessions, listChatMessages, type ChatSession } from "@/lib/actions/chat";
import { getAnalysesByIds, type AnalysisWithMethodology } from "@/lib/actions/analysis";
import { getUserPlan } from "@/lib/actions/billing";
import { TIER_LIMITS } from "@/lib/billing";
import { MethodologyCard } from "@/components/analysis/methodology-card";
import { Disclosure } from "@/components/compliance/disclosure";

const MESSAGES_PAGE_SIZE = 30;

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

function sessionLabel(session: ChatSession): string {
  return session.title?.trim() || `Chat — ${new Date(session.created_at).toLocaleDateString()}`;
}

function sessionWhen(session: ChatSession): string {
  return new Date(session.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function ChatThread({ compact = false }: { compact?: boolean }) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [depth, setDepth] = useState<"top_line" | "full">("full");
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function withAnalyses(history: Awaited<ReturnType<typeof listChatMessages>>): Promise<Message[]> {
    return Promise.all(
      history.map(async (m) => ({
        role: m.role,
        content: m.content,
        analyses:
          m.referenced_analysis_ids.length > 0 ? await getAnalysesByIds(m.referenced_analysis_ids) : undefined,
      })),
    );
  }

  async function loadSession(id: string) {
    setSessionId(id);
    setHistoryOpen(false);
    const history = await listChatMessages(id, 0);
    setMessages(await withAnalyses(history));
    setPage(0);
    setHasMore(history.length === MESSAGES_PAGE_SIZE);
  }

  async function loadOlderMessages() {
    if (!sessionId || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const nextPage = page + 1;
      const older = await listChatMessages(sessionId, nextPage);
      const olderWithAnalyses = await withAnalyses(older);
      setMessages((prev) => [...olderWithAnalyses, ...prev]);
      setPage(nextPage);
      setHasMore(older.length === MESSAGES_PAGE_SIZE);
    } finally {
      setLoadingOlder(false);
    }
  }

  async function startNewChat() {
    const created = await createChatSession();
    setSessions((prev) => [created, ...prev]);
    setSessionId(created.id);
    setMessages([]);
    setHistoryOpen(false);
  }

  useEffect(() => {
    (async () => {
      const [list, plan] = await Promise.all([listChatSessions(), getUserPlan()]);
      setDepth(TIER_LIMITS[plan].analysisDepth);
      setSessions(list);
      if (list.length > 0) {
        await loadSession(list[0].id);
      } else {
        const created = await createChatSession();
        setSessions([created]);
        setSessionId(created.id);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

      if (!res.ok) {
        const errorText = (await res.text()) || "Something went wrong. Try again.";
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: "assistant", content: errorText };
          return next;
        });
        return;
      }

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

      // First send in a fresh session gives it a title server-side -- refresh
      // the list so it shows up as something other than a bare date.
      const wasUntitled = sessions.find((s) => s.id === sessionId)?.title == null;
      if (wasUntitled) {
        setSessions(await listChatSessions());
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

  const filteredSessions = sessions.filter((s) => sessionLabel(s).toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <div>
        <button
          type="button"
          onClick={() => setHistoryOpen((o) => !o)}

 >
          History {historyOpen ? "▲" : "▼"}
        </button>
        <button
          type="button"
          onClick={startNewChat}

 >
          + New thread
        </button>

        {historyOpen && (
          <div>
            <div>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search conversations…"

 />
            </div>
            <div>History</div>
            <div>
              {filteredSessions.length === 0 ? (
                <div>No conversations found.</div>
              ) : (
                filteredSessions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => loadSession(s.id)}

 >
                    <div>{sessionLabel(s)}</div>
                    <div>{sessionWhen(s)}</div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      <div ref={scrollRef}>
        {messages.length === 0 ? (
          <p>
            Ask about a ticker, sector, or market trend — I&apos;ll answer from stored research only.
          </p>
        ) : (
          <div>
            {hasMore && (
              <button
                type="button"
                onClick={loadOlderMessages}
                disabled={loadingOlder}

 >
                {loadingOlder ? "Loading…" : "Load earlier messages"}
              </button>
            )}
            {messages.map((m, i) => (
              <div key={i}>
                <div

 >
                  {m.content}
                  {streaming && m.role === "assistant" && i === messages.length - 1 && (
                    <span />
                  )}
                </div>
                {/* Every assistant response gets its own attached disclosure, not
                    just ones that happen to cite a MethodologyCard (which already
                    embeds one) — the panel-level Disclosure below the composer
                    isn't enough on its own for a plain-text reply. */}
                {m.role === "assistant" && m.content && (!m.analyses || m.analyses.length === 0) && (
                  <div>
                    <Disclosure />
                  </div>
                )}
                {m.analyses && m.analyses.length > 0 && (
                  <div>
                    {m.analyses.map((a) => (
                      <MethodologyCard key={a.id} analysis={a} dense depth={depth} />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask about NVDA, semiconductors, the market…"
          disabled={streaming}

 />
        <button
          type="button"
          onClick={send}
          disabled={streaming || !input.trim()}

 >
          Send
        </button>
      </div>
      <div>
        <Disclosure />
      </div>
    </div>
  );
}
