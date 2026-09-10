"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  createChatSession,
  deleteChatSession,
  listChatSessions,
  listChatMessages,
  type ChatSession,
} from "@/lib/actions/chat";
import { findMissingAnalysisScope, getAnalysesByIds } from "@/lib/actions/analysis";
import { CHAT_STATE_MARKER, type ChatGenerationState } from "@/lib/chat-state";
import {
  GeneratingPanel,
  QuotaReachedPanel,
  UnavailablePanel,
} from "@/components/analysis/research-states";
import type { ChatMessageData } from "@/components/chat/chat-message";
import { MethodologyCard } from "@/components/analysis/methodology-card";
import { getUserPlan } from "@/lib/actions/billing";
import { TIER_LIMITS } from "@/lib/billing";
import Link from "next/link";
import { Disclosure } from "@/components/compliance/disclosure";
import { ChatMessage } from "@/components/chat/chat-message";

const MESSAGES_PAGE_SIZE = 30;

// Quick-start suggestions under the composer.
//
// The mock's three examples were kept verbatim, and two of them - "How is my
// portfolio doing today?" and "Am I too concentrated in semis?" - ask about
// the user's own position, which is exactly what the scope guard exists to
// refuse. The product was advertising prompts it is built to reject, teaching
// a first-run user the wrong shape of question and burning a message to do it.
//
// These three ask the same underlying things at market/sector/ticker scope,
// which is what the engine actually answers.
const SUGGESTED_PROMPTS = [
  "What's moving semiconductors this week?",
  "What's the volatility outlook on NVDA?",
  "How have past rate decisions moved this market?",
];

// The message shape lives with the component that renders it.
type Message = ChatMessageData;

const REFS_MARKER = /\sCAIRN_REFS:(\[[^\]]*\])$/;

// CAIRN_STATE is emitted after CAIRN_REFS, so it is stripped first and the
// refs parser then sees the same shape it always did.
function splitStream(raw: string): { text: string; ids: string[]; state: ChatGenerationState | null } {
  let rest = raw;
  let state: ChatGenerationState | null = null;

  const stateMatch = rest.match(CHAT_STATE_MARKER);
  if (stateMatch) {
    try {
      state = JSON.parse(stateMatch[1]) as ChatGenerationState;
      rest = rest.slice(0, stateMatch.index);
    } catch {
      // Malformed sentinel: leave the text alone rather than truncating a
      // real reply on a parse failure.
    }
  }

  const refsMatch = rest.match(REFS_MARKER);
  if (!refsMatch) return { text: rest, ids: [], state };
  try {
    return { text: rest.slice(0, refsMatch.index), ids: JSON.parse(refsMatch[1]), state };
  } catch {
    return { text: rest, ids: [], state };
  }
}

function sessionLabel(session: ChatSession): string {
  return session.title?.trim() || `Chat - ${new Date(session.created_at).toLocaleDateString()}`;
}

function sessionWhen(session: ChatSession): string {
  return new Date(session.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * The methodology behind one assistant turn.
 *
 * `open` renders the cards inline; otherwise they sit behind a disclosure that
 * still names how many analyses are there, so a collapsed turn advertises its
 * evidence rather than hiding that any exists.
 */
function MethodologyBlock({
  analyses,
  depth,
  dense,
  open,
}: {
  analyses: React.ComponentProps<typeof MethodologyCard>["analysis"][];
  depth: React.ComponentProps<typeof MethodologyCard>["depth"];
  dense: boolean;
  open: boolean;
}) {
  const cards = (
    <div className="flex flex-col gap-3">
      {analyses.map((a) => (
        <MethodologyCard key={a.id} analysis={a} depth={depth} dense={dense} />
      ))}
    </div>
  );

  if (open) return cards;

  return (
    <details className="group flex flex-col gap-2">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-mono text-eyebrow text-muted uppercase transition-colors duration-fast ease-standard hover:text-primary">
        <svg
          width="9"
          height="9"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          className="shrink-0 transition-transform duration-base ease-standard group-open:rotate-180"
          aria-hidden
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
        Methodology · {analyses.length === 1 ? "1 analysis" : `${analyses.length} analyses`}
      </summary>
      <div className="mt-1">{cards}</div>
    </details>
  );
}

export function ChatThread({
  compact = false,
  briefing,
  expandMethodology = true,
}: {
  compact?: boolean;
  briefing?: ReactNode;
  /** Settings > AI Assistant default for expanding the methodology card. */
  expandMethodology?: boolean;
}) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  // Set when this turn named a scope with nothing on file, so the reader sees
  // the generation happening rather than a silent pause. Turn-local: never
  // written to chat_messages, so no chat-specific storage exists.
  const [generatingScope, setGeneratingScope] = useState<string | null>(null);
  const [turnState, setTurnState] = useState<ChatGenerationState | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  // Distinguishes "we haven't looked yet" from "we looked and there is
  // nothing". Rendering the empty state during the fetch told returning users
  // their history was gone.
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [depth, setDepth] = useState<"top_line" | "full">("full");
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Ends the client-side typing animation for an in-flight turn. It cannot stop
  // *generation* - the whole answer is produced, scope-guarded and written to
  // chat_messages server-side before the first byte streams (see
  // app/api/chat/route.ts). So the button is "Skip", not "Stop", and on click
  // the view is synced to the persisted turn rather than left truncated.
  const abortRef = useRef<AbortController | null>(null);

  // Every turn that cited an analysis gets its methodology, not just the most
  // recent one.
  //
  // This used to resolve only the last message with referenced ids and hand
  // every earlier turn `analyses: undefined`. Scroll back through a
  // conversation and each previous answer was left as a bare probability claim
  // with its sources, analogs and confidence no longer reachable - the exact
  // thing the product's guardrail forbids, produced by the history loader
  // rather than by the model.
  //
  // Still one round trip: the ids are unioned across the whole page of history
  // and fetched together, then handed back to the turns that cited them.
  async function withAnalyses(history: Awaited<ReturnType<typeof listChatMessages>>): Promise<Message[]> {
    const allIds = Array.from(new Set(history.flatMap((m) => m.referenced_analysis_ids)));
    const fetched = allIds.length > 0 ? await getAnalysesByIds(allIds) : [];
    const byId = new Map(fetched.map((a) => [a.id, a]));
    return history.map((m) => {
      const analyses = m.referenced_analysis_ids
        .map((id) => byId.get(id))
        .filter((a): a is (typeof fetched)[number] => a !== undefined);
      return {
        role: m.role,
        content: m.content,
        analyses: analyses.length > 0 ? analyses : undefined,
      };
    });
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

  // Clears to an unsaved draft thread rather than writing a row. The session
  // is created on the first send (see `send`), so opening the assistant and
  // walking away no longer litters history with empty conversations.
  function startNewChat() {
    setSessionId(null);
    setMessages([]);
    setHistoryOpen(false);
    setPage(0);
    setHasMore(false);
  }

  useEffect(() => {
    (async () => {
      try {
        const [list, plan] = await Promise.all([listChatSessions(), getUserPlan()]);
        setDepth(TIER_LIMITS[plan].analysisDepth);
        setSessions(list);
        // No session is created here. An empty thread is a UI state, not a row.
        if (list.length > 0) await loadSession(list[0].id);
      } finally {
        setSessionsLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function send(override?: string) {
    const text = (override ?? input).trim();
    if (!text || streaming) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }, { role: "assistant", content: "" }]);
    setStreaming(true);
    setTurnState(null);
    setGeneratingScope(null);

    // Ask the same question the route is about to ask - findMissingAnalysisScope
    // is one function, so the panel below can never claim a generation the
    // server isn't actually running. This only decides what the reader sees
    // while they wait; the route decides what actually happens, and the
    // generation itself is the route's single runAnalysisGeneration call.
    try {
      const missing = await findMissingAnalysisScope(text);
      if (missing) setGeneratingScope(missing.scopeValue);
    } catch {
      // A failed probe just means no generating panel - never a failed turn.
    }

    // The session row is created here, on the first real message, rather than
    // on mount. `createdNow` is remembered so a failed first turn can take the
    // empty session back out with it instead of leaving a stub in history.
    let activeSessionId = sessionId;
    let createdNow = false;
    try {
      if (!activeSessionId) {
        const created = await createChatSession();
        activeSessionId = created.id;
        createdNow = true;
        setSessionId(created.id);
        setSessions((prev) => [created, ...prev]);
      }

      abortRef.current = new AbortController();
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: activeSessionId, message: text }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        // 503 carries the "temporarily busy" line; other statuses carry their
        // own plain-language reason. Either way the server persisted nothing,
        // so this bubble is a transient failed-turn state, not history.
        const errorText = (await res.text()) || "Something went wrong. Try again.";
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: "assistant", content: errorText, failed: true };
          return next;
        });
        if (createdNow && activeSessionId) await discardEmptySession(activeSessionId);
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
        const { text: displayText } = splitStream(raw);
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: "assistant", content: displayText };
          return next;
        });
      }

      const { ids, state } = splitStream(raw);
      // Generation is over either way - drop the in-flight panel before
      // showing what came of it.
      setGeneratingScope(null);
      setTurnState(state);
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
      const wasUntitled = createdNow || sessions.find((s) => s.id === activeSessionId)?.title == null;
      if (wasUntitled) {
        setSessions(await listChatSessions());
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // "Skip" pressed. The turn was fully generated and saved before
        // streaming began, so sync the thread to the persisted turn - leaving
        // the truncated copy on screen would silently be replaced by the full
        // answer on the next reload.
        if (activeSessionId) {
          try {
            const history = await listChatMessages(activeSessionId, 0);
            setMessages(await withAnalyses(history));
          } catch {
            // Best effort - if the reload fails the reader still has the
            // partial answer, and a manual reload will show the full one.
          }
        }
      } else {
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = {
            role: "assistant",
            content: "The assistant could not be reached. Nothing was saved - please try again.",
            failed: true,
          };
          return next;
        });
        if (createdNow && activeSessionId) await discardEmptySession(activeSessionId);
      }
    } finally {
      abortRef.current = null;
      setStreaming(false);
      setGeneratingScope(null);
    }
  }

  function skipAnimation() {
    abortRef.current?.abort();
  }

  /**
   * Removes a session that was created for a turn that then failed. Best
   * effort: if the delete itself fails the worst case is one empty thread in
   * history, which is strictly better than losing the user's place.
   */
  async function discardEmptySession(id: string) {
    try {
      await deleteChatSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      setSessionId(null);
    } catch {
      // leave it; nothing user-visible depends on the cleanup succeeding
    }
  }

  const filteredSessions = sessions.filter((s) => sessionLabel(s).toLowerCase().includes(search.toLowerCase()));

  // Methodology travels with the turn that cited it.
  //
  // It used to render once, at the foot of the thread, for the newest reply
  // only. That kept a long thread tidy at the cost of the guardrail: every
  // answer above the fold became a probability claim with no visible sources,
  // analogs or confidence. Attaching each card to its own turn keeps the
  // evidence with the claim; collapsing every turn but the newest keeps the
  // thread from becoming a wall of cards, which was the original concern.
  const lastAssistantIndex = messages.reduce(
    (found, m, i) => (m.role === "assistant" && !m.failed ? i : found),
    -1,
  );

  const conversation = (
    <>
      <div ref={scrollRef} className={`flex-1 overflow-y-auto ${compact ? "px-3 py-3" : "p-5"}`}>
        {messages.length === 0 ? (
          // Was the same 13px weight as the composer's own input text with no
          // border/background to separate them - close enough in size and
          // position to read as the input field itself. Smaller, dimmer,
          // italic and with a leading glyph reads as a caption instead.
          <p className="flex items-start gap-1.5 text-caption text-dim italic">
            <span aria-hidden className="not-italic">
              ↳
            </span>
            Ask about a ticker, sector, or market trend - I&apos;ll answer from stored research only.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {hasMore && (
              <button
                type="button"
                onClick={loadOlderMessages}
                disabled={loadingOlder}
                className="mx-auto rounded-control px-3 py-1.5 text-caption text-muted transition-colors duration-fast ease-standard hover:bg-active hover:text-primary disabled:opacity-50"
              >
                {loadingOlder ? "Loading…" : "Load earlier messages"}
              </button>
            )}
            {messages.map((m, i) => {
              const isStreaming = streaming && m.role === "assistant" && i === messages.length - 1;
              const analyses = m.role === "assistant" && !m.failed && !isStreaming ? (m.analyses ?? []) : [];
              return (
                <div key={i} className="flex flex-col gap-3">
                  <ChatMessage message={m} streaming={isStreaming} />
                  {analyses.length > 0 && (
                    <MethodologyBlock
                      analyses={analyses}
                      depth={depth}
                      dense={compact}
                      // The newest reply follows Settings > AI Assistant >
                      // "Show methodology by default"; older turns always
                      // start collapsed.
                      open={i === lastAssistantIndex && expandMethodology}
                    />
                  )}
                </div>
              );
            })}

            {/* Chat-triggered generation, shown inline. These are the Research
                page's own panels, not chat-specific copies. */}
            {generatingScope && (
              <div>
                <p className="mb-2.5 text-body leading-relaxed text-muted text-pretty">
                  No analysis on record yet for {generatingScope} — generating one now…
                </p>
                <GeneratingPanel scopeLabel={generatingScope} />
              </div>
            )}

            {turnState?.kind === "unavailable" && <UnavailablePanel />}

            {turnState?.kind === "quota" && turnState.quota && (
              <QuotaReachedPanel
                used={turnState.quota.used}
                limit={turnState.quota.limit}
                planLabel={turnState.quota.planLabel}
                resetLabel={turnState.quota.resetLabel}
              />
            )}

          </div>
        )}
      </div>

      {/* Composer: input row, quick prompts, and the single compliance
          disclosure - one dark footer, matching the artboard. */}
      <div className="border-t border-line bg-canvas px-4 py-3.5">
        <div className="flex items-end gap-2.5">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Ask about your holdings, a ticker, or today's move…"
            disabled={streaming}
            className="min-w-0 flex-1 rounded-panel border border-line bg-panel px-3 py-3 text-body text-primary outline-none transition-colors duration-fast ease-standard focus:border-accent disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() => (streaming ? skipAnimation() : send())}
            disabled={!streaming && !input.trim()}
            title={streaming ? "Show the full answer now (it's already generated)" : undefined}
            className={`shrink-0 rounded-panel px-4.5 py-3 text-body font-semibold transition-[box-shadow] duration-base ease-standard disabled:opacity-50 ${
              streaming
                ? "border border-line bg-transparent text-primary hover:border-line-strong"
                : "bg-gradient-to-br from-accent-light to-accent-dark text-canvas hover:shadow-[0_0_22px_rgba(47,198,133,0.35)]"
            }`}
          >
            {streaming ? "Skip" : "Send"}
          </button>
        </div>
        {!compact && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {SUGGESTED_PROMPTS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => send(p)}
                disabled={streaming}
                className="rounded-full border border-line px-3 py-1.5 text-caption text-muted transition-colors duration-fast ease-standard hover:border-accent hover:text-primary disabled:opacity-50"
              >
                {p}
              </button>
            ))}
          </div>
        )}
        <div className="mt-2.5">
          <Disclosure />
        </div>
      </div>
    </>
  );

  // Full page: the mock's "232px 1fr" grid - a persistent history rail beside
  // the briefing + conversation column. The compact floating panel has no room
  // for a rail, so it keeps history in a dropdown.
  if (!compact) {
    return (
      <div className="grid items-start gap-4 min-[900px]:grid-cols-[232px_1fr]">
        <aside className="overflow-hidden rounded-card border border-line bg-panel">
          <div className="border-b border-line px-4 py-3.5">
            <button
              type="button"
              onClick={startNewChat}
              className="w-full rounded-control border border-line py-2 text-body text-primary transition-colors duration-base ease-standard hover:border-accent"
            >
              + New thread
            </button>
          </div>
          <div className="px-2 py-2.5">
            <div className="px-2 pt-1 pb-2 font-mono text-eyebrow text-dim uppercase">History</div>
            {sessionsLoading ? (
              // Three inert bars, not the empty-state copy. Saying "no
              // conversations yet" before the fetch resolves told returning
              // users their history had been lost.
              <div className="px-2.5 py-2" aria-busy="true" aria-live="polite">
                <span className="sr-only">Loading conversations…</span>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="mb-2 h-[13px] animate-pulse rounded-xs bg-active" aria-hidden="true" />
                ))}
              </div>
            ) : sessions.length === 0 ? (
              <div className="px-2.5 py-2 text-caption text-dim">No conversations yet.</div>
            ) : (
              sessions.map((sess) => (
                <div
                  key={sess.id}
                  className={`group mb-0.5 flex items-center gap-1 rounded-control pr-1 transition-colors duration-fast ease-standard hover:bg-active ${
                    sess.id === sessionId ? "bg-active" : ""
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => loadSession(sess.id)}
                    className={`min-w-0 flex-1 px-2.5 py-2 text-left ${
                      sess.id === sessionId ? "text-primary" : "text-muted"
                    }`}
                  >
                    <div className="truncate text-body">{sessionLabel(sess)}</div>
                    <div className="mt-1 text-micro text-dim">{sessionWhen(sess)}</div>
                  </button>
                  {/* Managing a conversation is its own page, not an inline
                      form: rename, per-chat assistant preferences and delete
                      all live at /assistant/[sessionId]/settings. */}
                  <Link
                    href={`/assistant/${sess.id}/settings`}
                    aria-label={`Manage ${sessionLabel(sess)}`}
                    title="Manage conversation"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control text-dim opacity-0 transition-opacity duration-fast ease-standard group-hover:opacity-100 focus-visible:opacity-100 hover:text-primary max-[900px]:opacity-100"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="3" />
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
                      </svg>
                  </Link>
                </div>
              ))
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
          className="rounded-control px-2.5 py-1.5 text-caption text-muted transition-colors duration-fast ease-standard hover:bg-active hover:text-primary"
        >
          History {historyOpen ? "▲" : "▼"}
        </button>
        <button
          type="button"
          onClick={startNewChat}
          className="rounded-control px-2.5 py-1.5 text-caption text-muted transition-colors duration-fast ease-standard hover:bg-active hover:text-primary"
        >
          + New thread
        </button>

        {historyOpen && (
          <div className="absolute top-full left-0 z-10 mt-1 w-full overflow-hidden rounded-control border border-line bg-panel shadow-lg">
            <div className="border-b border-line p-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search conversations…"
                className="w-full rounded-control border border-line bg-active px-2.5 py-1.5 text-body text-primary outline-none"
              />
            </div>
            <div className="px-3 pt-2 pb-1 font-mono text-eyebrow text-dim uppercase">History</div>
            <div className="max-h-64 overflow-y-auto py-1">
              {sessionsLoading ? (
                <div className="px-3 py-2 text-caption text-dim" aria-busy="true" aria-live="polite">
                  Loading conversations…
                </div>
              ) : filteredSessions.length === 0 ? (
                <div className="px-3 py-2 text-caption text-dim">No conversations found.</div>
              ) : (
                filteredSessions.map((sess) => (
                  <div
                    key={sess.id}
                    className="group flex items-center gap-1 rounded-control pr-1 transition-colors duration-fast ease-standard hover:bg-active"
                  >
                    <button
                      type="button"
                      onClick={() => loadSession(sess.id)}
                      className={`min-w-0 flex-1 px-3 py-2 text-left ${
                        sess.id === sessionId ? "text-primary" : "text-muted"
                      }`}
                    >
                      <div className="truncate text-body">{sessionLabel(sess)}</div>
                      <div className="mt-0.5 text-micro text-dim">{sessionWhen(sess)}</div>
                    </button>
                    <Link
                      href={`/assistant/${sess.id}/settings`}
                      aria-label={`Manage ${sessionLabel(sess)}`}
                      title="Manage conversation"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control text-dim hover:text-primary"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="3" />
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
                      </svg>
                    </Link>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {conversation}
    </div>
  );
}
