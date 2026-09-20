import Link from "next/link";
import type { ConcentrationSummary } from "@/lib/portfolio";

// The mock's "Concentration" card beside Allocation - names the single
// biggest risk to the line above (one symbol dominating the book) and routes
// straight to setting a guard on it, rather than leaving that connection for
// the reader to make themselves.
export function ConcentrationPanel({ summary }: { summary: ConcentrationSummary | null }) {
  if (!summary) return null;
  const { topSymbol, topSharePct, namesOverThreshold, totalPositions } = summary;

  const concentrationNote =
    namesOverThreshold >= totalPositions
      ? "Every position together makes up the book — there's no single name concentrated enough to isolate."
      : namesOverThreshold === 1
        ? `Your top position alone carries over 60% of the book — a single earnings miss moves the whole line.`
        : `${namesOverThreshold} names carry over 60% of the book — a single earnings miss moves the whole line.`;

  return (
    <div className="relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-[#232323] bg-panel px-[22px] py-5">
      <span
        aria-hidden
        className="absolute top-0 right-0 left-0 h-px"
        style={{ background: "linear-gradient(90deg,var(--color-accent),transparent)" }}
      />
      <span className="font-mono text-eyebrow tracking-[0.18em] text-accent uppercase">Concentration</span>
      <p className="text-body text-muted text-pretty">
        Your top position is <strong className="font-semibold text-primary">{topSymbol}</strong> at{" "}
        {topSharePct.toFixed(0)}% of value. {concentrationNote}
      </p>
      <Link
        href="/alerts"
        className="mt-1 inline-flex w-fit items-center gap-2 rounded-control border border-accent/35 bg-accent/[0.08] px-3.5 py-2.5 text-body text-accent-light transition-colors duration-base ease-standard hover:bg-accent/[0.16]"
      >
        Set a drawdown alert →
      </Link>
    </div>
  );
}
