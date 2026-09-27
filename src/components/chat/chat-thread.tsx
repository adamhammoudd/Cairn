"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  createChatSession,
  deleteChatSession,
  listChatSessions,
  listChatMessages,
  setAssistantPortfolioContext,
  getAssistantPortfolioContext,
  type ChatSession,
} from "@/lib/actions/chat";
import { getAnalysesByIds } from "@/lib/actions/analysis";
import { decodeEvents } from "@/lib/ai/assistant/stream";
import type { AssistantMeta } from "@/lib/ai/assistant/types";
import type { ChatMessageData } from "@/components/chat/chat-message";
import { MethodologyCard } from "@/components/analysis/methodology-card";
import Link from "next/link";
import { Disclosure } from "@/components/compliance/disclosure";
import { ChatMessage } from "@/components/chat/chat-message";
import { BetaNote } from "@/components/billing/beta-note";

const MESSAGES_PAGE_SIZE = 30;

// Quick-start suggestions under the composer. Assistant v2 answers factual
// questions about the reader's own portfolio (never whether to keep or sell a
// position), so "How's my portfolio doing?" is a question it is built for now.
const SUGGESTED_PROMPTS = ["How's my portfolio doing?", "How's NVIDIA looking?", "What's moving the market this week?"];

// The message shape lives with the component that renders it.
type Message = ChatMessageData;

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
  dense,
  open,
}: {
  analyses: React.ComponentProps<typeof MethodologyCard>["analysis"][];
  dense: boolean;
  open: boolean;
}) {
  const cards = (
    <div className="flex flex-col gap-3">
      {analyses.map((a) => (
        <MethodologyCard key={a.id} analysis={a} dense={dense} />
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
  betaUntil = null,
  usePortfolioContext = true,
}: {
  compact?: boolean;
  /** "31 December 2026" while beta Premium access is on (getBetaAccessLabel), else null. */
  betaUntil?: string | null;
  /** Settings > AI Assistant "Portfolio context" (the account default; a conversation may override it). */
  usePortfolioContext?: boolean;
  briefing?: ReactNode;
  /** Settings > AI Assistant default for expanding the methodology card. */
  expandMethodology?: boolean;
}) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  // The account-level portfolio-context preference, as last set from the
  // header switch. A conversation's own override (chat_sessions) wins.
  const [portfolioDefault, setPortfolioDefault] = useState(usePortfolioContext);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  // Distinguishes "we haven't looked yet" from "we looked and there is
  // nothing". Rendering the empty state during the fetch told returning users
  // their history was gone.
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [search, setSearch] = useState("");
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
        meta: ((m as { meta?: unknown }).meta ?? null) as AssistantMeta | null,
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
        // The plan gate is applied on the server (attachMethodology), before
        // the analyses reach this component.
        // The floating panel has no page to hand it the setting; read it here
        // so the header never misstates what the next answer will do.
        void getAssistantPortfolioContext().then(setPortfolioDefault).catch(() => {});
        const list = await listChatSessions();
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
      // Newline-delimited JSON events (lib/ai/assistant/stream.ts): tool
      // activity while the answer is built, then the validated text, then its
      // tiles, sources and follow-ups.
      let buffer = "";
      let answerText = "";
      const activity: string[] = [];
      let meta: AssistantMeta | null = null;
      let refs: string[] = [];
      let failure: string | null = null;
      const update = (patch: Partial<Message>) =>
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { ...next[next.length - 1], ...patch };
          return next;
        });

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const decoded = decodeEvents(buffer + decoder.decode(value, { stream: true }));
        buffer = decoded.rest;
        for (const e of decoded.events) {
          if (e.t === "activity") {
            if (!activity.includes(e.label)) activity.push(e.label);
            update({ activity: [...activity] });
          } else if (e.t === "text") {
            answerText += e.chunk;
            update({ content: answerText, activity: undefined });
          } else if (e.t === "meta") {
            meta = e.meta;
            update({ meta });
          } else if (e.t === "refs") refs = e.ids;
          else if (e.t === "error") failure = e.message;
        }
      }

      if (failure) {
        // The server saved nothing for a failed turn.
        update({ content: failure, failed: true, activity: undefined, meta: null });
        if (createdNow && activeSessionId) await discardEmptySession(activeSessionId);
        return;
      }

      if (refs.length > 0) {
        const analyses = await getAnalysesByIds(refs);
        update({ analyses });
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

  const activeSession = sessions.find((x) => x.id === sessionId) ?? null;
  const portfolioOn = activeSession?.use_portfolio_context ?? portfolioDefault;

  async function togglePortfolio() {
    const next = !portfolioOn;
    setPortfolioDefault(next);
    if (activeSession) setSessions((prev) => prev.map((x) => (x.id === activeSession.id ? { ...x, use_portfolio_context: null } : x)));
    const error = await setAssistantPortfolioContext(next, sessionId);
    if (error) setPortfolioDefault(!next);
  }

  const conversation = (
    <>
      <div className={`flex flex-wrap items-center justify-between gap-2 border-b border-line ${compact ? "px-3 py-2" : "px-5 py-2.5"}`}>
        <p className="m-0 min-w-0 text-micro text-muted">
          {portfolioOn ? "Using your portfolio: answers can include your holdings' values and dates." : "Not using your portfolio in answers."}
        </p>
        <button
          type="button"
          role="switch"
          aria-checked={portfolioOn}
          onClick={togglePortfolio}
          className="flex shrink-0 items-center gap-2 rounded-control px-1.5 py-1 text-micro text-muted transition-colors duration-fast ease-standard hover:text-primary pointer-coarse:min-h-11"
        >
          Portfolio context
          <span aria-hidden className={`relative h-4 w-7 rounded-full transition-colors duration-fast ease-standard ${portfolioOn ? "bg-accent" : "bg-line-strong"}`}>
            <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-canvas transition-[left] duration-fast ease-standard ${portfolioOn ? "left-3.5" : "left-0.5"}`} />
          </span>
        </button>
      </div>
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
            Ask about a share, a coin, the market or your own portfolio. Every figure comes from Cairn&apos;s data, with sources.
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
                  <ChatMessage message={m} streaming={isStreaming} onFollowUp={i === lastAssistantIndex && !streaming ? (q) => send(q) : undefined} />
                  {analyses.length > 0 && (
                    <MethodologyBlock
                      analyses={analyses}
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

          </div>
        )}
      </div>

      {/* Composer: input row, quick prompts, and the single compliance
          disclosure - one dark footer, matching the artboard. */}
      <div className="relative border-t border-line bg-canvas px-4 py-3.5">
        <span
          aria-hidden
          className="absolute top-0 right-0 left-0 h-px"
          style={{ background: "linear-gradient(90deg,#2fc685,rgba(47,198,133,0))" }}
        />
        <div className="flex items-end gap-2.5">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Ask about your holdings, a ticker, or today's move…"
            disabled={streaming}
            className="min-w-0 flex-1 rounded-[12px] border border-line bg-panel px-3.5 py-3.5 text-lead text-primary outline-none transition-[border-color,box-shadow] duration-fast ease-standard placeholder:text-dim focus:border-accent focus:shadow-[0_0_0_3px_rgba(47,198,133,0.14)] disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() => (streaming ? skipAnimation() : send())}
            disabled={!streaming && !input.trim()}
            title={streaming ? "Show the full answer now (it's already generated)" : undefined}
            className={`shrink-0 rounded-[10px] px-[18px] py-3.5 text-[12.5px] font-bold transition-[background,transform] duration-base ease-standard disabled:opacity-50 ${
              streaming
                ? "border border-line bg-transparent text-primary hover:border-line-strong"
                : "bg-accent text-canvas hover:-translate-y-px hover:bg-accent-light"
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
        <aside className="overflow-hidden rounded-2xl border border-[#232323] bg-panel">
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
          {betaUntil && (
            <div className="border-t border-line px-3 py-3">
              <BetaNote until={betaUntil} compact />
            </div>
          )}
        </aside>

        <div className="flex min-w-0 flex-col gap-4">
          {briefing}
          <div className="flex min-h-75 flex-col overflow-hidden rounded-2xl border border-[#232323] bg-panel">
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
