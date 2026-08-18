"use client";

import { useTransition } from "react";
import { requestBriefing } from "@/lib/actions/briefing";
import type { BriefingContent } from "@/lib/ai/briefing";
import type { AnalysisWithMethodology } from "@/lib/actions/analysis";
import { MethodologyCard } from "@/components/analysis/methodology-card";
import { Disclosure } from "@/components/compliance/disclosure";

interface BriefingCardProps {
  briefing: BriefingContent | null;
  analyses: AnalysisWithMethodology[];
  analysisDepth: "top_line" | "full";
}

export function BriefingCard({ briefing, analyses, analysisDepth }: BriefingCardProps) {
  const [pending, startTransition] = useTransition();

  const today = new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

  return (
    <div className="flex flex-col gap-3.5">
      <div className="relative overflow-hidden rounded-card border border-line bg-gradient-to-b from-[#121212] to-panel p-5">
        {/* Soft accent bloom, purely atmospheric — sits behind the content. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: "radial-gradient(420px 140px at 12% 0%, rgba(47,198,133,0.10), transparent 70%)",
          }}
        />

        <div className="relative flex flex-wrap items-baseline justify-between gap-2.5">
          <div>
            <div className="font-mono text-[10px] tracking-[0.16em] text-accent uppercase">
              Daily briefing · {today}
            </div>
            <h2 className="mt-2 font-serif text-[24px] leading-tight font-normal text-primary">
              {briefing ? "What moved, and what's next" : "No briefing yet today"}
            </h2>
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(() => requestBriefing())}
            className="rounded-lg border border-line bg-canvas/60 px-3 py-1.75 text-[12px] text-primary transition-colors duration-base ease-standard hover:border-[#3A3A3A] disabled:opacity-50"
          >
            {pending ? "Generating…" : briefing ? "Refresh" : "Generate"}
          </button>
        </div>

        {!briefing ? (
          <p className="relative mt-3 text-[13px] text-muted text-pretty">
            Generate one above and Cairn summarises the day across your holdings and watchlist — with sources on
            every claim.
          </p>
        ) : (
          <>
            <p className="relative mt-3.5 max-w-[760px] text-[13.5px] leading-relaxed text-primary text-pretty">
              {briefing.summary}
            </p>

            {briefing.upcoming_events.length > 0 && (
              <div className="relative mt-4 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2.5">
                {briefing.upcoming_events.slice(0, 3).map((e, i) => (
                  <div key={i} className="rounded-xl border border-line bg-canvas/55 px-3.25 py-3">
                    <div className="font-mono text-[9.5px] tracking-[0.12em] text-warning uppercase">
                      {e.event_type}
                    </div>
                    <div className="mt-1.75 text-[12.5px] leading-snug text-primary">{e.symbol}</div>
                    <div className="mt-1.5 text-[11px] text-dim">{e.event_date}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {briefing && (
          <div className="relative mt-4 border-t border-line pt-3">
            <Disclosure />
          </div>
        )}
      </div>

      {analyses.map((a) => (
        <MethodologyCard key={a.id} analysis={a} dense depth={analysisDepth} />
      ))}
    </div>
  );
}
