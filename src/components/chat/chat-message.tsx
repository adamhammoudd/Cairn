"use client";

import type { AnalysisWithMethodology } from "@/lib/actions/analysis";
import { MarkdownMessage } from "@/components/chat/markdown-message";

// Just the bubble, per the `messages` sc-for in the AI Assistant artboard
// (Cairn.dc.html): flex row, gap 11px, justify-<end|start>; bubble max-width
// 660px, padding 12px 15px, border 1px, radius 13px, 13.5px / 1.65.
// user  bg #151515 / border #2A2A2A      assistant bg #0C0C0C / border #232323
//
// The methodology card and the compliance disclosure are NOT rendered here.
// The mock shows exactly one `showAnalysis` card after the whole message list
// and one disclosure by the composer - not one of each per turn, which is what
// made a multi-turn thread read as a wall of cards. ChatThread owns both.

export interface ChatMessageData {
  role: "user" | "assistant";
  content: string;
  /** Analyses this turn cited - used by ChatThread to pick the one card to show. */
  analyses?: AnalysisWithMethodology[];
  /**
   * A turn that could not be completed. Nothing was persisted server-side, so
   * this bubble lives only for the life of the page - labelled as a failure
   * rather than dressed up as an assistant reply.
   */
  failed?: boolean;
}

interface ChatMessageProps {
  message: ChatMessageData;
  /** Renders the blinking caret while this message is still streaming. */
  streaming?: boolean;
}

export function ChatMessage({ message, streaming }: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <div className={`animate-rise-in flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`border text-lead leading-[1.65] ${
          !isUser && !message.failed ? "" : "whitespace-pre-wrap"
        } ${
          message.failed
            ? "max-w-[min(560px,86%)] rounded-2xl border-dashed border-line bg-transparent px-4 py-3 text-muted"
            : isUser
              ? // The design gives the visitor's own turn a tinted bubble with
                // one squared corner on the side it came from, so a thread
                // reads as a conversation rather than a stack of panels.
                "max-w-[min(560px,86%)] rounded-[16px_16px_4px_16px] border-accent/25 bg-[#1c2a23] px-[17px] py-[13px] text-[#e6f5ee]"
              : "w-full rounded-[16px_16px_16px_4px] border-[#232323] bg-panel px-[22px] py-5 text-primary"
        }`}
      >
        {/* Cairn's turns are signed. An answer that carries sources and a
            confidence level should say who is making the claim; the visitor's
            own turn needs no attribution. */}
        {!isUser && !message.failed && (
          <div className="mb-3 flex items-center gap-2.5">
            <span
              aria-hidden
              className="grid h-6 w-6 place-items-center rounded-control border border-accent/35 bg-accent/15 font-mono text-[9px] tracking-[0.06em] text-accent"
            >
              AI
            </span>
            <span className="font-mono text-eyebrow tracking-[0.16em] text-dim uppercase">Cairn</span>
          </div>
        )}
        {/* Not red: red is reserved for loss/destructive indicators (CLAUDE.md).
            A turn that did not complete is neither, so it reads as provisional. */}
        {message.failed && (
          <span className="mb-1.5 block font-mono text-eyebrow text-dim uppercase">Not delivered</span>
        )}
        {/* Assistant replies render as real markdown; the user's own text and
            failure notices stay literal. The scope guard ran on the raw text
            server-side, so rendering changes nothing it checked. */}
        {isUser || message.failed ? message.content : <MarkdownMessage content={message.content} />}
        {streaming && (
          <span className="ml-1 inline-block h-[15px] w-[7px] translate-y-[2px] animate-blink bg-accent align-middle" />
        )}
      </div>
    </div>
  );
}
