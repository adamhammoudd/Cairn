"use client";

import { useTransition } from "react";
import { requestBriefing } from "@/lib/actions/briefing";
import type { BriefingContent } from "@/lib/ai/briefing";

export function BriefingCard({ briefing }: { briefing: BriefingContent | null }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="rounded-card border border-line bg-panel p-6">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-xs tracking-[0.08em] text-muted uppercase">Today&apos;s briefing</div>
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => requestBriefing())}
          className="rounded-lg border border-line px-3 py-1.5 text-[12.5px] text-primary disabled:opacity-50"
        >
          {pending ? "Generating…" : briefing ? "Refresh" : "Generate"}
        </button>
      </div>

      {!briefing ? (
        <p className="text-[13px] text-muted">No briefing yet today — generate one above.</p>
      ) : (
        <>
          <p className="mb-4 text-[13.5px] leading-relaxed text-primary">{briefing.summary}</p>
          {briefing.analyses.length > 0 && (
            <div className="mb-3 flex flex-col gap-2">
              {briefing.analyses.slice(0, 5).map((a) => (
                <div key={a.id} className="flex items-center justify-between text-[12.5px]">
                  <span className="text-primary">
                    {a.scope_value} · {a.analysis_type.replace(/_/g, " ")}
                  </span>
                  <span className="text-muted">
                    {a.probability_low}–{a.probability_high}% · {a.confidence_level}
                  </span>
                </div>
              ))}
            </div>
          )}
          {briefing.upcoming_events.length > 0 && (
            <div className="flex flex-col gap-1.5 border-t border-line pt-3">
              {briefing.upcoming_events.slice(0, 5).map((e, i) => (
                <div key={i} className="text-[12.5px] text-muted">
                  <span className="text-primary">{e.symbol}</span> — {e.event_type} · {e.event_date}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
