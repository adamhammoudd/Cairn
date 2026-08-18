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
    <div>
      <div>
        {/* Soft accent bloom, purely atmospheric — sits behind the content. */}
        <div
          aria-hidden

 />

        <div>
          <div>
            <div>
              Daily briefing · {today}
            </div>
            <h2>
              {briefing ? "What moved, and what's next" : "No briefing yet today"}
            </h2>
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(() => requestBriefing())}

 >
            {pending ? "Generating…" : briefing ? "Refresh" : "Generate"}
          </button>
        </div>

        {!briefing ? (
          <p>
            Generate one above and Cairn summarises the day across your holdings and watchlist — with sources on
            every claim.
          </p>
        ) : (
          <>
            <p>
              {briefing.summary}
            </p>

            {briefing.upcoming_events.length > 0 && (
              <div>
                {briefing.upcoming_events.slice(0, 3).map((e, i) => (
                  <div key={i}>
                    <div>
                      {e.event_type}
                    </div>
                    <div>{e.symbol}</div>
                    <div>{e.event_date}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {briefing && (
          <div>
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
