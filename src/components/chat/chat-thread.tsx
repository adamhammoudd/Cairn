"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  createChatSession,
  deleteChatSession,
  listChatSessions,
  listChatMessages,
  renameChatSession,
  type ChatSession,
} from "@/lib/actions/chat";
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

export function ChatThread({ compact = false, briefing }: { compact?: boolean; briefing?: ReactNode }) {
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
  // Which conversation is being renamed, and the draft title for it.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [historyError, setHistoryError] = useState<string | null>(null);
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

  function startRename(session: ChatSession) {
    setEditingId(session.id);
    setDraftTitle(session.title?.trim() || sessionLabel(session));
    setHistoryError(null);
  }

  async function commitRename(id: string) {
    const title = draftTitle;
    setEditingId(null);
    const error = await renameChatSession(id, title);
    if (error) {
      setHistoryError(error);
      return;
    }
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, title: title.trim() } : s)));
  }

  async function removeSession(id: string) {
    if (!window.confirm("Delete this conversation and its messages? This cannot be undone.")) return;
    const error = await deleteChatSession(id);
    if (error) {
      setHistoryError(error);
      return;
    }
    setSessions((prev) => prev.filter((s) => s.id !== id));
    // Deleting the open thread leaves nothing to show, so clear the transcript
    // rather than leaving messages on screen that no longer exist.
    if (id === sessionId) {
      setSessionId(null);
      setMessages([]);
    }
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

  const conversation = (
    <>
      <div ref={scrollRef} className={`flex-1 overflow-y-auto ${compact ? "px-3 py-3" : "p-5"}`}>
        {messages.length === 0 ? (
          <p className="text-[13px] text-muted">
            Ask about a ticker, sector, or market trend — I&apos;ll answer from stored research only.
          </p>
        ) : (
          <div className="flex flex-col gap-3.5">
            {hasMore && (
              <button
                type="button"
                onClick={loadOlderMessages}
                disabled={loadingOlder}
                className="mx-auto rounded-lg px-3 py-1.5 text-[12px] text-muted transition-colors duration-fast ease-standard hover:bg-active hover:text-primary disabled:opacity-50"
              >
                {loadingOlder ? "Loading…" : "Load earlier messages"}
              </button>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex flex-col gap-2 ${m.role === "user" ? "items-end" : "items-start"}`}>
                <div
                  className={`max-w-[88%] rounded-xl px-4 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-wrap ${
                    m.role === "user" ? "bg-active text-primary" : "border border-line bg-panel text-primary"
                  }`}
                >
                  {m.content}
                  {streaming && m.role === "assistant" && i === messages.length - 1 && (
                    <span className="ml-0.5 inline-block h-[15px] w-[7px] translate-y-[2px] animate-blink bg-accent align-middle" />
                  )}
                </div>
                {/* Every assistant response gets its own attached disclosure, not
                    just ones that happen to cite a MethodologyCard (which already
                    embeds one) — the panel-level Disclosure below the composer
                    isn't enough on its own for a plain-text reply. */}
                {m.role === "assistant" && m.content && (!m.analyses || m.analyses.length === 0) && (
                  <div className="w-[92%]">
                    <Disclosure />
                  </div>
                )}
                {m.analyses && m.analyses.length > 0 && (
                  <div className="flex w-[92%] flex-col gap-2">
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
          className="rounded-lg bg-gradient-to-br from-accent-light to-accent-dark px-3.5 py-2 text-[13px] font-semibold text-canvas disabled:opacity-50"
        >
          Send
        </button>
      </div>
      <div className="px-3 pb-2">
        <Disclosure />
      </div>
    </>
  );

  // Full page: the mock's "232px 1fr" grid — a persistent history rail beside
  // the briefing + conversation column. The compact floating panel has no room
  // for a rail, so it keeps history in a dropdown.
  if (!compact) {
    return (
      <div className="grid items-start gap-4 min-[900px]:grid-cols-[232px_1fr]">
        <aside className="overflow-hidden rounded-card border border-line bg-panel">
          <div className="border-b border-line px-3.75 py-3.5">
            <button
              type="button"
              onClick={startNewChat}
              className="w-full rounded-[9px] border border-line py-2.25 text-[12.5px] text-primary transition-colors duration-base ease-standard hover:border-accent"
            >
              + New thread
            </button>
          </div>
          <div className="px-2 py-2.5">
            <div className="px-2 pt-1 pb-2 font-mono text-[9.5px] tracking-[0.14em] text-dim uppercase">History</div>
            {historyError && <div className="px-2.5 pb-1.5 text-[11.5px] text-negative">{historyError}</div>}
            {sessions.length === 0 ? (
              <div className="px-2.5 py-2 text-[12px] text-dim">No conversations yet.</div>
            ) : (
              sessions.map((s) =>
                editingId === s.id ? (
                  <form
                    key={s.id}
                    onSubmit={(e) => {
                      e.preventDefault();
                      void commitRename(s.id);
                    }}
                    className="mb-0.5 px-1"
                  >
                    <input
                      autoFocus
                      value={draftTitle}
                      onChange={(e) => setDraftTitle(e.target.value)}
                      onBlur={() => void commitRename(s.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      className="w-full rounded-[9px] border border-accent bg-canvas px-2 py-2 text-[12.5px] text-primary outline-none"
                    />
                  </form>
                ) : (
                  <div
                    key={s.id}
                    className={`group mb-0.5 flex items-center gap-1 rounded-[9px] pr-1 transition-colors duration-fast ease-standard hover:bg-[#171717] ${
                      s.id === sessionId ? "bg-active" : ""
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => loadSession(s.id)}
                      className={`min-w-0 flex-1 px-2.5 py-2.25 text-left ${
                        s.id === sessionId ? "text-primary" : "text-muted"
                      }`}
                    >
                      <div className="truncate text-[12.5px]">{sessionLabel(s)}</div>
                      <div className="mt-0.75 text-[10.5px] text-dim">{sessionWhen(s)}</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => startRename(s)}
                      aria-label={`Rename ${sessionLabel(s)}`}
                      title="Rename"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-dim opacity-0 transition-opacity duration-fast ease-standard group-hover:opacity-100 focus-visible:opacity-100 hover:text-primary max-[900px]:opacity-100"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => void removeSession(s.id)}
                      aria-label={`Delete ${sessionLabel(s)}`}
                      title="Delete"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-negative opacity-0 transition-opacity duration-fast ease-standard group-hover:opacity-100 focus-visible:opacity-100 max-[900px]:opacity-100"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 6h18" />
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                      </svg>
                    </button>
                  </div>
                ),
              )
            )}
          </div>
        </aside>

        <div className="flex min-w-0 flex-col gap-4">
          {briefing}
          <div className="flex min-h-75 flex-col overflow-hidden rounded-card border border-line bg-panel">
            {conversation}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="relative flex items-center justify-between gap-2 border-b border-line px-3 py-2.5">
        <button
          type="button"
          onClick={() => setHistoryOpen((o) => !o)}
          className="rounded-lg px-2.5 py-1.5 text-[12px] text-muted transition-colors duration-fast ease-standard hover:bg-active hover:text-primary"
        >
          History {historyOpen ? "▲" : "▼"}
        </button>
        <button
          type="button"
          onClick={startNewChat}
          className="rounded-lg px-2.5 py-1.5 text-[12px] text-muted transition-colors duration-fast ease-standard hover:bg-active hover:text-primary"
        >
          + New thread
        </button>

        {historyOpen && (
          <div className="absolute top-full left-0 z-10 mt-1 w-full overflow-hidden rounded-lg border border-line bg-panel shadow-lg">
            <div className="border-b border-line p-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search conversations…"
                className="w-full rounded-lg border border-line bg-active px-2.5 py-1.5 text-[12.5px] text-primary outline-none"
              />
            </div>
            <div className="px-3 pt-2 pb-1 font-mono text-[9.5px] tracking-[0.14em] text-dim uppercase">History</div>
            <div className="max-h-64 overflow-y-auto py-1">
              {filteredSessions.length === 0 ? (
                <div className="px-3 py-2 text-[12px] text-dim">No conversations found.</div>
              ) : (
                filteredSessions.map((s) =>
                  editingId === s.id ? (
                    <form
                      key={s.id}
                      onSubmit={(e) => {
                        e.preventDefault();
                        void commitRename(s.id);
                      }}
                      className="px-2 py-1"
                    >
                      <input
                        autoFocus
                        value={draftTitle}
                        onChange={(e) => setDraftTitle(e.target.value)}
                        onBlur={() => void commitRename(s.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        className="w-full rounded-lg border border-accent bg-canvas px-2 py-1.5 text-[12.5px] text-primary outline-none"
                      />
                    </form>
                  ) : (
                    <div
                      key={s.id}
                      className="group flex items-center gap-1 rounded-lg pr-1 transition-colors duration-fast ease-standard hover:bg-active"
                    >
                      <button
                        type="button"
                        onClick={() => loadSession(s.id)}
                        className={`min-w-0 flex-1 px-3 py-2 text-left ${
                          s.id === sessionId ? "text-primary" : "text-muted"
                        }`}
                      >
                        <div className="truncate text-[12.5px]">{sessionLabel(s)}</div>
                        <div className="mt-0.5 text-[10.5px] text-dim">{sessionWhen(s)}</div>
                      </button>
                      <button
                        type="button"
                        onClick={() => startRename(s)}
                        aria-label={`Rename ${sessionLabel(s)}`}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-dim hover:text-primary"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeSession(s.id)}
                        aria-label={`Delete ${sessionLabel(s)}`}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-negative"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 6h18" />
                          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                        </svg>
                      </button>
                    </div>
                  ),
                )
              )}
            </div>
          </div>
        )}
      </div>

      {conversation}
    </div>
  );
}
