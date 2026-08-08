import type { AnalysisWithMethodology } from "@/lib/actions/analysis";

const CONFIDENCE_COLOR: Record<string, string> = {
  high: "text-accent",
  medium: "text-primary",
  low: "text-negative",
};

export function MethodologyCard({ analysis }: { analysis: AnalysisWithMethodology }) {
  return (
    <div className="rounded-card border border-line bg-panel p-6">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-[11.5px] tracking-[0.06em] text-muted uppercase">
            {analysis.scope_type} · {analysis.scope_value}
          </div>
          <div className="mt-1 font-serif text-lg text-primary capitalize">
            {analysis.analysis_type.replace(/_/g, " ")}
          </div>
        </div>
        <div className="text-right">
          <div className="font-serif text-xl text-primary">
            {analysis.probability_low}–{analysis.probability_high}%
          </div>
          <div className={`text-[12px] capitalize ${CONFIDENCE_COLOR[analysis.confidence_level] ?? "text-muted"}`}>
            {analysis.confidence_level} confidence
          </div>
        </div>
      </div>

      <p className="mb-4 text-[13.5px] leading-relaxed text-primary">{analysis.reasoning_text}</p>

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
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {analysis.confidence_level === "low" && (
        <div className="mt-4 rounded-lg border border-line bg-active px-3 py-2 text-[12px] text-muted">
          Low-confidence output — small historical sample or weak pattern match. Treat as directional, not precise.
        </div>
      )}

      <div className="mt-4 border-t border-line pt-3 text-[11px] leading-relaxed text-dim">
        Market/sector/ticker-level analytical output, not personalized financial advice. Not a
        recommendation to buy, hold, or sell anything.
      </div>
    </div>
  );
}
