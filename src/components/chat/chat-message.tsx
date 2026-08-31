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
    <div className={`animate-rise-in flex gap-2.75 ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[660px] rounded-[13px] border px-3.75 py-3 text-[13.5px] leading-[1.65] ${
          !isUser && !message.failed ? "" : "whitespace-pre-wrap"
        } ${
          message.failed
            ? "border-dashed border-line bg-transparent text-muted"
            : `text-primary ${isUser ? "border-line bg-[#151515]" : "border-[#232323] bg-[#0C0C0C]"}`
        }`}
      >
        {/* Not red: red is reserved for loss/destructive indicators (CLAUDE.md).
            A turn that did not complete is neither, so it reads as provisional. */}
        {message.failed && (
          <span className="mb-1.5 block font-mono text-[9.5px] tracking-[0.14em] text-dim uppercase">Not delivered</span>
        )}
        {/* Assistant replies render as real markdown; the user's own text and
            failure notices stay literal. The scope guard ran on the raw text
            server-side, so rendering changes nothing it checked. */}
        {isUser || message.failed ? message.content : <MarkdownMessage content={message.content} />}
        {streaming && (
          <span className="ml-0.75 inline-block h-[15px] w-[7px] translate-y-[2px] animate-blink bg-accent align-middle" />
        )}
      </div>
    </div>
  );
}
