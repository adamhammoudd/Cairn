import type { AnalysisWithMethodology } from "@/lib/actions/analysis";
import type { CalendarEvent } from "@/lib/calendar";
import { Disclosure } from "@/components/compliance/disclosure";

const CONFIDENCE_COLOR: Record<string, string> = {
  high: "text-accent",
  medium: "text-primary",
  low: "text-negative",
};

interface MethodologyCardProps {
  analysis: AnalysisWithMethodology;
  /** Visual/layout density — chat and briefing use this, unrelated to plan tier. */
  dense?: boolean;
  /** @deprecated use `dense` — kept so existing call sites don't break mid-migration. */
  compact?: boolean;
  /**
   * Content depth, driven by the viewer's plan (Free = "top_line", Premium =
   * "full") — see getUserPlan() in lib/actions/billing.ts and TIER_LIMITS in
   * lib/billing.ts. Only changes how much sources/analogs detail renders.
   * confidence_level, reasoning_text, and the low-confidence warning below
   * render identically at both depths — that honesty guarantee never varies
   * by plan, only the amount of supporting detail does.
   */
  depth?: "top_line" | "full";
  /** Upcoming calendar events for this analysis's scope — context, not an input to the probability. */
  upcomingEvents?: CalendarEvent[];
}

export function MethodologyCard({
  analysis,
  dense,
  compact = false,
  depth = "full",
  upcomingEvents = [],
}: MethodologyCardProps) {
  const isDense = dense ?? compact;
  const isTopLine = depth === "top_line";

  return (
    <div className={`rounded-card border border-line bg-panel ${isDense ? "p-4" : "p-6"}`}>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-[11.5px] tracking-[0.06em] text-muted uppercase">
            {analysis.scope_type} · {analysis.scope_value}
          </div>
          <div className={`mt-1 font-serif text-primary capitalize ${isDense ? "text-base" : "text-lg"}`}>
            {analysis.analysis_type.replace(/_/g, " ")}
          </div>
        </div>
        <div className="text-right">
          <div className={`font-serif text-primary ${isDense ? "text-lg" : "text-xl"}`}>
            {analysis.probability_low}–{analysis.probability_high}%
          </div>
          <div className={`text-[12px] capitalize ${CONFIDENCE_COLOR[analysis.confidence_level] ?? "text-muted"}`}>
            {analysis.confidence_level} confidence
          </div>
        </div>
      </div>

      <p className={`text-primary leading-relaxed ${isDense ? "mb-3 text-[13px]" : "mb-4 text-[13.5px]"}`}>
        {analysis.reasoning_text}
      </p>

      {isTopLine ? (
        <div className="mb-3 text-[12px] text-muted">
          {analysis.sources.length} source{analysis.sources.length === 1 ? "" : "s"} ·{" "}
          {analysis.sample_size} historical analog{analysis.sample_size === 1 ? "" : "s"}
          <span className="text-dim"> · Full sources, analogs, and match detail on Premium</span>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="mb-2 text-[11px] tracking-[0.06em] text-muted uppercase">
              Sources ({analysis.sources.length})
            </div>
            {analysis.sources.length === 0 ? (
              <div className="text-[12.5px] text-dim">None cited</div>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {analysis.sources.map((s) => (
                  <li key={s.id} className="text-[12.5px] text-muted">
                    {s.url ? (
                      <a href={s.url} target="_blank" rel="noreferrer" className="text-accent">
                        {s.title}
                      </a>
                    ) : (
                      s.title
                    )}
                    <span className="text-dim"> · {s.source_name}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <div className="mb-2 text-[11px] tracking-[0.06em] text-muted uppercase">
              Historical analogs ({analysis.sample_size} sample{analysis.sample_size === 1 ? "" : "s"})
            </div>
            {analysis.analogs.length === 0 ? (
              <div className="text-[12.5px] text-dim">None matched</div>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {analysis.analogs.map((e) => (
                  <li key={e.id} className="text-[12.5px] text-muted">
                    <span className="text-primary">{e.symbol ?? e.sector}</span> — {e.event_type} ·{" "}
                    {new Date(e.event_date).toLocaleDateString()}
                    <span className="text-dim"> · {Math.round(e.similarity_score * 100)}% match</span>
                    {e.note && <span className="text-dim"> — {e.note}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {upcomingEvents.length > 0 && (
        <div className="mt-3 rounded-lg border border-line bg-active px-3 py-2">
          <div className="mb-1.5 text-[11px] tracking-[0.06em] text-muted uppercase">
            Upcoming for {analysis.scope_value}
          </div>
          <div className="flex flex-col gap-1">
            {upcomingEvents.slice(0, 3).map((e) => (
              <div key={e.id} className="text-[12px] text-muted">
                <span className="capitalize">{e.event_type}</span> ·{" "}
                {new Date(`${e.event_date}T00:00:00`).toLocaleDateString()}
              </div>
            ))}
          </div>
        </div>
      )}

      {analysis.confidence_level === "low" && (
        <div className="mt-3 rounded-lg border border-line bg-active px-3 py-2 text-[12px] text-muted">
          Low-confidence output — small historical sample or weak pattern match. Treat as directional, not precise.
        </div>
      )}

      <div className="mt-3 border-t border-line pt-3">
        <Disclosure />
      </div>
    </div>
  );
}
