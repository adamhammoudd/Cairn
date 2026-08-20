import type { AnalysisWithMethodology } from "@/lib/actions/analysis";
import type { CalendarEvent } from "@/lib/calendar";
import { Disclosure } from "@/components/compliance/disclosure";

// Structure taken from the assistant panel in Context/mockups/Cairn.dc.html
// (the `showAnalysis` block): a bordered header strip carrying scope, subject,
// probability range and confidence, then a body whose Sources and Historical
// analogs columns sit in an auto-fit grid, then the compliance callout.
//
// This is the methodology-display component the compliance framework requires
// every probability output to render through - research page, daily briefing
// and chat all use this one file, so the way sources, analogs and confidence
// are presented cannot drift between surfaces.

// text-negative is reserved exclusively for loss/destructive indicators (see
// CLAUDE.md brand guardrail) - low confidence is neither, so it uses the
// warning token instead.
const CONFIDENCE_COLOR: Record<string, string> = {
  high: "text-accent",
  medium: "text-primary",
  low: "text-warning",
};

const SECTION_LABEL = "mb-2 font-mono text-[9.5px] tracking-[0.12em] text-dim uppercase";

// Relative age, matching the mock's "38m / 3h / Aug 11" ladder. Anything older
// than a week gets a date rather than an ever-growing hour count.
function whenLabel(iso: string): string {
  const then = new Date(iso);
  const minutes = Math.floor((Date.now() - then.getTime()) / 60_000);
  if (!Number.isFinite(minutes) || minutes < 0) return then.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (minutes < 60) return `${Math.max(minutes, 1)}m`;
  if (minutes < 60 * 24 * 7) {
    const hours = Math.floor(minutes / 60);
    return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
  }
  return then.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

interface MethodologyCardProps {
  analysis: AnalysisWithMethodology;
  /** Visual/layout density - chat and briefing use this, unrelated to plan tier. */
  dense?: boolean;
  /** @deprecated use `dense` - kept so existing call sites don't break mid-migration. */
  compact?: boolean;
  /**
   * Content depth, driven by the viewer's plan (Free = "top_line", Premium =
   * "full") - see getUserPlan() in lib/actions/billing.ts and TIER_LIMITS in
   * lib/billing.ts. Only changes how much sources/analogs detail renders.
   * confidence_level, reasoning_text, the low-confidence warning and the
   * disclosure below render identically at both depths - that honesty
   * guarantee never varies by plan, only the amount of supporting detail does.
   */
  depth?: "top_line" | "full";
  /** Upcoming calendar events for this analysis's scope - context, not an input to the probability. */
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
  const pad = isDense ? "px-4 py-3.5" : "px-4.25 py-3.75";

  return (
    <div className="animate-rise-in overflow-hidden rounded-[13px] border border-[#262626] bg-[#0C0C0C]">
      <div className={`flex flex-wrap items-start justify-between gap-3 border-b border-[#1E1E1E] ${pad}`}>
        <div className="min-w-0">
          <div className="font-mono text-[9.5px] tracking-[0.14em] text-muted uppercase">
            {analysis.scope_type} · {analysis.scope_value}
          </div>
          <div className={`mt-1.5 font-serif text-primary capitalize ${isDense ? "text-[15px]" : "text-[17px]"}`}>
            {analysis.analysis_type.replace(/_/g, " ")}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className={`font-serif tabular-nums text-primary ${isDense ? "text-[19px]" : "text-[22px]"}`}>
            {analysis.probability_low}–{analysis.probability_high}%
          </div>
          <div className={`text-[11.5px] capitalize ${CONFIDENCE_COLOR[analysis.confidence_level] ?? "text-muted"}`}>
            {analysis.confidence_level} confidence
          </div>
        </div>
      </div>

      <div className={pad}>
        <p className="mb-3.5 text-[13px] leading-[1.65] text-primary text-pretty">{analysis.reasoning_text}</p>

      {isTopLine ? (
        <div className="mb-3 text-[12px] text-muted">
          {analysis.sources.length} source{analysis.sources.length === 1 ? "" : "s"} ·{" "}
          {analysis.sample_size} historical analog{analysis.sample_size === 1 ? "" : "s"}
          <span className="text-dim"> · Full sources, analogs, and match detail on Premium</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                      <span className="text-accent">{s.title}</span>
                    )}
                    <span className="text-dim"> · {s.source_name}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4.5">
            <div>
              <div className={SECTION_LABEL}>Sources ({analysis.sources.length})</div>
              {analysis.sources.length === 0 ? (
                <div className="text-[12px] text-dim">None cited</div>
              ) : (
                <ul>
                  {analysis.sources.map((s) => (
                    <li key={s.id} className="mb-1.5 text-[12px] leading-relaxed text-muted last:mb-0">
                      {s.url ? (
                        <a href={s.url} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                          {s.title}
                        </a>
                      ) : (
                        <span className="text-accent">{s.title}</span>
                      )}{" "}
                      · {s.source_name}
                      <span className="text-dim" suppressHydrationWarning>
                        {" "}
                        · {whenLabel(s.published_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <div className={SECTION_LABEL}>Historical analogs ({analysis.sample_size})</div>
              {analysis.analogs.length === 0 ? (
                <div className="text-[12px] text-dim">None matched</div>
              ) : (
                <ul>
                  {analysis.analogs.map((e, i) => {
                    const matchPct = Math.round(e.similarity_score * 100);
                    return (
                      <li key={e.id} className="mb-2 last:mb-0">
                        <div className="flex items-center justify-between gap-2.5 text-[12px] text-muted">
                          <span className="min-w-0 truncate">
                            <span className="text-primary">{e.symbol ?? e.sector}</span> · {e.event_type} ·{" "}
                            {new Date(e.event_date).toLocaleDateString(undefined, {
                              month: "short",
                              year: "numeric",
                            })}
                            {e.note && <span className="text-dim"> — {e.note}</span>}
                          </span>
                          <span className="shrink-0 tabular-nums text-dim">{matchPct}%</span>
                        </div>
                        <div className="mt-1 h-0.75 overflow-hidden rounded-sm bg-[#1C1C1C]">
                          {/* Match bars grow left-to-right with a 70ms stagger,
                              per the mock's motion spec for this card. */}
                          <div
                            className="animate-grow-x h-full origin-left rounded-sm bg-gradient-to-r from-accent-light to-accent-dark"
                            style={{ width: `${matchPct}%`, animationDelay: `${i * 70}ms` }}
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
          <div className="mt-3.5 rounded-[10px] border border-[#262626] bg-[#101010] px-3 py-2.5">
            <div className={SECTION_LABEL}>Upcoming for {analysis.scope_value}</div>
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
          <div className="mt-3.5 rounded-[10px] border border-[#262626] bg-[#101010] px-3 py-2.5 text-[11.5px] leading-relaxed text-muted">
            Low-confidence output — small historical sample or weak pattern match. Treat as directional, not precise.
          </div>
        )}

        <div className="mt-3.5">
          <Disclosure variant="callout" />
        </div>
      </div>
    </div>
  );
}
