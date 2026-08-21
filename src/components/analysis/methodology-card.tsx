import type { AnalysisWithMethodology } from "@/lib/actions/analysis";
import type { CalendarEvent } from "@/lib/calendar";
import { Disclosure } from "@/components/compliance/disclosure";
// RSS titles arrive HTML-escaped, so a cited source rendered raw shows
// "Nvidia&#x2019;s" verbatim in the sources list. The news panel already
// decodes at display time; this is the same helper, not a second one.
import { decodeEntities } from "@/lib/news";

// Structure and values taken verbatim from the Research artboard's detail view
// in Context/mockups/Cairn.dc.html (the `rHasDetail` block): a gradient header
// strip carrying scope/question/finding/probability/confidence, then Sources as
// an auto-fit card grid, then Historical analogs in their own inset panel with
// match bars, then the compliance callout.
//
// This is the methodology-display component the compliance framework requires
// every probability output to render through - Research detail column, daily
// briefing, ticker page and chat all use this one file, so the way sources,
// analogs and confidence are presented cannot drift between surfaces. The
// chat-triggered generation path renders this component too rather than a
// chat-specific variant.

// text-negative is reserved exclusively for loss/destructive indicators (see
// CLAUDE.md brand guardrail) - low confidence is neither, so it takes the
// neutral muted tint the mockup's CONF_STYLE.low uses.
const CONFIDENCE_STYLE: Record<
  string,
  { label: string; tint: string; bg: string; border: string; bars: number }
> = {
  high: { label: "High confidence", tint: "#2FC685", bg: "rgba(47,198,133,0.12)", border: "rgba(47,198,133,0.4)", bars: 3 },
  medium: { label: "Medium confidence", tint: "#D9A441", bg: "rgba(217,164,65,0.12)", border: "rgba(217,164,65,0.4)", bars: 2 },
  low: { label: "Low confidence", tint: "#8A8A8A", bg: "rgba(138,138,138,0.12)", border: "rgba(138,138,138,0.35)", bars: 1 },
};

const OFF_BAR = "#232323";

const SECTION_LABEL = "font-mono text-[9.5px] tracking-[0.14em] text-muted uppercase";
const META_LABEL = "font-mono text-[9.5px] tracking-[0.1em] uppercase text-dim";

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

// The mock's detail header separates a one-line "finding" (serif h2) from the
// body paragraph. The stored record has a single reasoning_text, so the finding
// is its opening sentence and the body is the remainder - a split of what the
// model actually wrote, never a second generated headline.
function splitFinding(text: string): { finding: string; body: string } {
  const match = text.match(/^([\s\S]*?[.!?])(\s+)([\s\S]*)$/);
  if (!match || match[1].length > 220) return { finding: text, body: "" };
  return { finding: match[1], body: match[3] };
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
   * lib/billing.ts. Per the mockup, this changes only how many historical
   * analogs are listed: Free sees the closest one plus a note that Premium
   * shows the rest. The finding, probability range, confidence_level, sources,
   * the low-confidence warning and the disclosure render identically at both
   * depths - that honesty guarantee never varies by plan.
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
  const conf = CONFIDENCE_STYLE[analysis.confidence_level] ?? CONFIDENCE_STYLE.low;
  const { finding, body } = splitFinding(analysis.reasoning_text);

  // Free tier shows the single closest analog; Premium shows all of them.
  const shownAnalogs = isTopLine ? analysis.analogs.slice(0, 1) : analysis.analogs;
  const hasHidden = isTopLine && analysis.analogs.length > 1;

  const pad = isDense ? "p-4" : "p-5";

  return (
    <div className="animate-rise-in overflow-hidden rounded-[14px] border border-[#262626] bg-[#0C0C0C]">
      <div className={`border-b border-[#1E1E1E] bg-gradient-to-b from-[#121212] to-[#0C0C0C] ${pad}`}>
        <div className="mb-3 flex flex-wrap items-center gap-2.5">
          <span className={`${SECTION_LABEL} capitalize`}>
            {analysis.scope_type} · {analysis.scope_value}
          </span>
          <span className={META_LABEL} suppressHydrationWarning>
            {whenLabel(analysis.created_at)}
          </span>
        </div>

        <div className="mb-2.5 font-mono text-[10px] tracking-[0.14em] text-accent uppercase">
          {analysis.analysis_type.replace(/_/g, " ")}
        </div>

        <h2
          className={`m-0 font-serif font-normal leading-[1.25] text-primary text-pretty ${
            isDense ? "text-[19px]" : "text-[25px]"
          }`}
        >
          {finding}
        </h2>

        <div className="mt-4 flex flex-wrap items-center gap-4">
          <div>
            <div className="font-mono text-[9px] tracking-[0.12em] text-dim uppercase">Probability range</div>
            <div
              className={`mt-1.25 font-serif leading-none tabular-nums text-primary ${
                isDense ? "text-[24px]" : "text-[32px]"
              }`}
            >
              {analysis.probability_low}–{analysis.probability_high}%
            </div>
          </div>

          <div
            className="flex items-center gap-2.25 rounded-[10px] border px-3.25 py-2.25"
            style={{ borderColor: conf.border, background: conf.bg }}
          >
            <div aria-hidden className="flex items-end gap-0.5">
              {[8, 12, 16].map((h, i) => (
                <span
                  key={h}
                  className="w-0.75 rounded-[1px]"
                  style={{ height: h, background: conf.bars >= i + 1 ? conf.tint : OFF_BAR }}
                />
              ))}
            </div>
            <span className="text-[12.5px]" style={{ color: conf.tint }}>
              {conf.label}
            </span>
          </div>
        </div>
      </div>

      <div className={pad}>
        {body && <p className="mb-5 text-[13.5px] leading-[1.7] text-primary text-pretty">{body}</p>}

        <div className="mb-5">
          <div className={`${SECTION_LABEL} mb-2.75`}>Sources · {analysis.sources.length}</div>
          {analysis.sources.length === 0 ? (
            <div className="text-[12px] text-dim">None cited</div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(260px,100%),1fr))] gap-2">
              {analysis.sources.map((s) => {
                const inner = (
                  <>
                    <div className="text-[12.5px] leading-[1.5] text-primary text-pretty">
                      {decodeEntities(s.title)}
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2.5">
                      <span className="text-[11px] text-accent">{s.source_name}</span>
                      <span className="font-mono text-[9.5px] tracking-[0.08em] text-dim uppercase" suppressHydrationWarning>
                        {whenLabel(s.published_at)}
                      </span>
                    </div>
                  </>
                );
                const boxClass =
                  "block min-w-0 rounded-[11px] border border-[#232323] bg-[#101010] px-3.5 py-3.25 transition-[border-color,transform] duration-[180ms] ease-[cubic-bezier(0.4,0,0.2,1)] hover:-translate-y-px hover:border-[#3A3A3A]";
                return s.url ? (
                  <a key={s.id} href={s.url} target="_blank" rel="noreferrer" className={boxClass}>
                    {inner}
                  </a>
                ) : (
                  <div key={s.id} className={boxClass}>
                    {inner}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="mb-4.5 rounded-[12px] border border-[#1E1E1E] bg-canvas p-4">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <span className={SECTION_LABEL}>Historical analogs</span>
            <span className={META_LABEL}>
              {shownAnalogs.length} of {analysis.sample_size} shown
            </span>
          </div>

          {analysis.analogs.length === 0 ? (
            <div className="text-[12px] text-dim">None matched</div>
          ) : (
            <div className="flex flex-col gap-3">
              {shownAnalogs.map((e, i) => {
                const matchPct = Math.round(e.similarity_score * 100);
                return (
                  <div key={e.id} className="animate-rise-in" style={{ animationDelay: `${i * 70}ms` }}>
                    <div className="flex items-center justify-between gap-2.5">
                      <span className="min-w-0 truncate text-[12.5px] text-primary">
                        {e.symbol ?? e.sector}{" "}
                        <span className="text-muted">
                          · {e.event_type} ·{" "}
                          {new Date(e.event_date).toLocaleDateString(undefined, { month: "short", year: "numeric" })}
                        </span>
                      </span>
                      <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted">{matchPct}% match</span>
                    </div>
                    <div className="mt-1.5 h-0.75 overflow-hidden rounded-sm bg-[#1C1C1C]">
                      {/* Match bars grow left-to-right over 620ms with a 70ms
                          stagger, per the mock's motion spec for this panel. */}
                      <div
                        className="animate-grow-x h-full origin-left rounded-sm bg-gradient-to-r from-accent-light to-accent-dark"
                        style={{ width: `${matchPct}%`, animationDelay: `${i * 70}ms` }}
                      />
                    </div>
                    {e.note && <div className="mt-1.75 text-[11.5px] leading-[1.55] text-muted text-pretty">{e.note}</div>}
                  </div>
                );
              })}
            </div>
          )}

          {hasHidden && (
            <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-[#232323] bg-[#101010] px-3.25 py-3">
              <div className="min-w-0">
                <div className="text-[12px] text-primary">Premium shows all {analysis.analogs.length} analogs</div>
                <div className="mt-1 text-[11.5px] leading-[1.5] text-muted text-pretty">
                  Same analysis, same confidence range, same caveats — more of the underlying comparisons visible.
                </div>
              </div>
              <a
                href="/billing"
                className="shrink-0 rounded-[9px] border border-line px-3.5 py-2 text-[12px] text-primary transition-[border-color] duration-[160ms] ease-[cubic-bezier(0.4,0,0.2,1)] hover:border-accent"
              >
                See all analogs
              </a>
            </div>
          )}
        </div>

        {upcomingEvents.length > 0 && (
          <div className="mb-4.5 rounded-[10px] border border-[#262626] bg-[#101010] px-3 py-2.5">
            <div className={`${SECTION_LABEL} mb-2`}>Upcoming for {analysis.scope_value}</div>
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
          <div className="mb-4.5 rounded-[10px] border border-[#262626] bg-[#101010] px-3 py-2.5 text-[11.5px] leading-relaxed text-muted">
            Low-confidence output — small historical sample or weak pattern match. Treat as directional, not precise.
          </div>
        )}

        <Disclosure variant="callout" />
      </div>
    </div>
  );
}
