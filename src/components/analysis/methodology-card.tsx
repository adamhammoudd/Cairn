import type { AnalysisWithMethodology } from "@/lib/actions/analysis";
import type { CalendarEvent } from "@/lib/calendar";
import { Disclosure } from "@/components/compliance/disclosure";

// text-negative is reserved exclusively for loss/destructive indicators (see
// CLAUDE.md brand guardrail) — low confidence is neither, so it uses the
// warning token instead.
const CONFIDENCE_COLOR: Record<string, string> = {
  high: "text-accent",
  medium: "text-primary",
  low: "text-warning",
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
    <div>
      <div>
        <div>
          <div>
            {analysis.scope_type} · {analysis.scope_value}
          </div>
          <div>
            {analysis.analysis_type.replace(/_/g, " ")}
          </div>
        </div>
        <div>
          <div>
            {analysis.probability_low}–{analysis.probability_high}%
          </div>
          <div>
            {analysis.confidence_level} confidence
          </div>
        </div>
      </div>

      <p>
        {analysis.reasoning_text}
      </p>

      {isTopLine ? (
        <div>
          {analysis.sources.length} source{analysis.sources.length === 1 ? "" : "s"} ·{" "}
          {analysis.sample_size} historical analog{analysis.sample_size === 1 ? "" : "s"}
          <span> · Full sources, analogs, and match detail on Premium</span>
        </div>
      ) : (
        <div>
          <div>
            <div>
              Sources ({analysis.sources.length})
            </div>
            {analysis.sources.length === 0 ? (
              <div>None cited</div>
            ) : (
              <ul>
                {analysis.sources.map((s) => (
                  <li key={s.id}>
                    {s.url ? (
                      <a href={s.url} target="_blank" rel="noreferrer">
                        {s.title}
                      </a>
                    ) : (
                      <span>{s.title}</span>
                    )}
                    <span> · {s.source_name}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <div>
              Historical analogs ({analysis.sample_size} sample{analysis.sample_size === 1 ? "" : "s"})
            </div>
            {analysis.analogs.length === 0 ? (
              <div>None matched</div>
            ) : (
              <ul>
                {analysis.analogs.map((e) => {
                  const matchPct = Math.round(e.similarity_score * 100);
                  return (
                    <li key={e.id}>
                      <div>
                        <span>
                          <span>{e.symbol ?? e.sector}</span> — {e.event_type} ·{" "}
                          {new Date(e.event_date).toLocaleDateString()}
                          {e.note && <span> — {e.note}</span>}
                        </span>
                        <span>{matchPct}%</span>
                      </div>
                      <div>
                        <div

 />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      {upcomingEvents.length > 0 && (
        <div>
          <div>
            Upcoming for {analysis.scope_value}
          </div>
          <div>
            {upcomingEvents.slice(0, 3).map((e) => (
              <div key={e.id}>
                <span>{e.event_type}</span> ·{" "}
                {new Date(`${e.event_date}T00:00:00`).toLocaleDateString()}
              </div>
            ))}
          </div>
        </div>
      )}

      {analysis.confidence_level === "low" && (
        <div>
          Low-confidence output — small historical sample or weak pattern match. Treat as directional, not precise.
        </div>
      )}

      <div>
        <Disclosure variant="callout" />
      </div>
    </div>
  );
}
