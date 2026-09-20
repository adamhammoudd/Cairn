import type { ConcentrationSummary } from "@/lib/portfolio";

// Plain arithmetic about how the book is split - which holding is largest and
// how many names make up most of it. It states no consequence and suggests no
// action: Cairn reports market-level context and never assesses a position.
export function ConcentrationPanel({ summary }: { summary: ConcentrationSummary | null }) {
  if (!summary) return null;
  const { topSymbol, topSharePct, namesOverThreshold, totalPositions } = summary;

  const spread =
    namesOverThreshold >= totalPositions
      ? `All ${totalPositions} positions together make up over 60% of the book.`
      : `${namesOverThreshold} ${namesOverThreshold === 1 ? "position makes" : "positions make"} up over 60% of the book.`;

  return (
    <div className="relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-[#232323] bg-panel px-[22px] py-5">
      <span
        aria-hidden
        className="absolute top-0 right-0 left-0 h-px"
        style={{ background: "linear-gradient(90deg,var(--color-accent),transparent)" }}
      />
      <span className="font-mono text-eyebrow tracking-[0.18em] text-accent uppercase">Concentration</span>
      <p className="text-body text-muted text-pretty">
        Largest holding: <strong className="font-semibold text-primary">{topSymbol}</strong> at{" "}
        {topSharePct.toFixed(0)}% of value. {spread}
      </p>
    </div>
  );
}
