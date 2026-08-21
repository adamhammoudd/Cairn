"use client";

import type { AnalysisWithMethodology } from "@/lib/actions/analysis";
import { MethodologyCard } from "@/components/analysis/methodology-card";
import { Disclosure } from "@/components/compliance/disclosure";

// Message structure taken from the assistant panel in
// Context/mockups/Cairn.dc.html (the `messages` sc-for and the `showAnalysis`
// block beneath it), not approximated from the general design:
//
//   row     display:flex; gap:11px; justify-content:<flex-end|flex-start>
//   bubble  max-width:660px; padding:12px 15px; border:1px solid <border>;
//           border-radius:13px; background:<bg>; font-size:13.5px;
//           line-height:1.65; white-space:pre-wrap
//   user    bg #151515 / border #2A2A2A      assistant bg #0C0C0C / border #232323
//   caret   7x15 accent block, cn-blink 1s steps(1) infinite
//
// The methodology card is a SIBLING of the bubble at full column width, not
// nested inside it - that is what gives sources, analogs and confidence their
// own visual weight in the mock instead of being crammed into the message.
// Same mapping MethodologyCard uses; text-negative stays reserved for
// loss/destructive indicators, so low confidence takes the warning token.
const CONFIDENCE_COLOR: Record<string, string> = {
  high: "text-accent",
  medium: "text-primary",
  low: "text-warning",
};

export interface ChatMessageData {
  role: "user" | "assistant";
  content: string;
  analyses?: AnalysisWithMethodology[];
  /**
   * A turn that could not be completed. Nothing was persisted server-side, so
   * this bubble lives only for the life of the page - it is labelled as a
   * failure rather than dressed up as an assistant reply, which is what made
   * the old inline error text read like the model had actually answered.
   */
  failed?: boolean;
}

interface ChatMessageProps {
  message: ChatMessageData;
  /** Renders the blinking caret while this message is still streaming. */
  streaming?: boolean;
  /** Plan-driven detail level passed straight through to MethodologyCard. */
  depth: "top_line" | "full";
  /** Settings > AI Assistant (or the per-chat override): expand methodology without a click. */
  expandMethodology: boolean;
  dense?: boolean;
}

export function ChatMessage({ message, streaming, depth, expandMethodology, dense }: ChatMessageProps) {
  const isUser = message.role === "user";
  const analyses = message.analyses ?? [];
  const hasAnalyses = analyses.length > 0;

  return (
    <div className="flex flex-col gap-3">
      <div className={`animate-rise-in flex gap-2.75 ${isUser ? "justify-end" : "justify-start"}`}>
        <div
          className={`max-w-[660px] rounded-[13px] border px-3.75 py-3 text-[13.5px] leading-[1.65] whitespace-pre-wrap ${
            message.failed
              ? "border-dashed border-line bg-transparent text-muted"
              : `text-primary ${isUser ? "border-line bg-[#151515]" : "border-[#232323] bg-[#0C0C0C]"}`
          }`}
        >
          {/* Deliberately not red: red is reserved for loss and destructive
              indicators (see CLAUDE.md brand rules). A turn that did not
              complete is neither, so it reads as muted and provisional. */}
          {message.failed && (
            <span className="mb-1.5 block font-mono text-[9.5px] tracking-[0.14em] text-dim uppercase">
              Not delivered
            </span>
          )}
          {message.content}
          {streaming && (
            <span className="ml-0.75 inline-block h-[15px] w-[7px] translate-y-[2px] animate-blink bg-accent align-middle" />
          )}
        </div>
      </div>

      {/* Rendered OUTSIDE the collapsible below, and for every assistant reply
          including ones that cite an analysis. The methodology card carries its
          own callout, but that card can be collapsed - if this were suppressed
          whenever an analysis was attached, collapsing methodology would leave
          a probability answer on screen with no disclosure attached to it. */}
      {!isUser && message.content && !streaming && !message.failed && (
        <div className="max-w-[660px]">
          <Disclosure />
        </div>
      )}

      {hasAnalyses && (
        <details open={expandMethodology} className="group flex flex-col gap-2">
          <summary className="mb-2 flex cursor-pointer list-none flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-[9.5px] tracking-[0.14em] text-muted uppercase transition-colors duration-fast ease-standard hover:text-primary">
            <svg
              width="9"
              height="9"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              className="shrink-0 transition-transform duration-base ease-standard group-open:rotate-180"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
            Methodology · {analyses.length === 1 ? "1 analysis" : `${analyses.length} analyses`}
            {/* Confidence and evidence counts stay on the summary so the
                collapsed state still says how well-supported the answer is,
                rather than hiding every qualifier behind a click. */}
            {analyses.map((a) => (
              <span key={a.id} className="normal-case">
                <span className={CONFIDENCE_COLOR[a.confidence_level] ?? "text-muted"}>
                  {a.confidence_level} confidence
                </span>
                <span className="text-dim">
                  {" "}
                  · {a.sources.length} source{a.sources.length === 1 ? "" : "s"} · {a.sample_size} analog
                  {a.sample_size === 1 ? "" : "s"}
                </span>
              </span>
            ))}
          </summary>
          <div className="flex flex-col gap-2.5">
            {analyses.map((a) => (
              <MethodologyCard key={a.id} analysis={a} dense={dense} depth={depth} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
