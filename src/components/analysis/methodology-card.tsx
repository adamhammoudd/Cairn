"use client";

// The analysis card used by chat and Research. Since feat/analysis-display-v2
// it is a thin adapter over AnalysisView (./analysis-view.tsx), the one
// component that draws an analysis everywhere, so the way sources, cases and
// confidence are presented cannot drift between surfaces. The plan gate is
// applied before this ever renders (attachMethodology, lib/actions/analysis.ts).

import type { AnalysisWithMethodology } from "@/lib/actions/analysis";
import { eventTypeLabel } from "@/lib/analysis";
import { AnalysisView } from "@/components/analysis/analysis-view";

export { splitFinding } from "@/components/analysis/split-finding";

interface MethodologyCardProps {
  analysis: AnalysisWithMethodology;
  /** Tighter spacing for the chat panel; the sections and their order do not change. */
  dense?: boolean;
}

export function MethodologyCard({ analysis, dense = false }: MethodologyCardProps) {
  // On Free the server has already cut the analogs to the closest one.
  const top = analysis.display.cases === null ? (analysis.analogs[0] ?? null) : null;
  const closestCase = top
    ? {
        date: top.event_date,
        label: `${eventTypeLabel(top.event_type)} · ${new Date(top.event_date).toLocaleDateString(undefined, { month: "short", year: "numeric" })}`,
        note: top.note,
      }
    : null;
  return <AnalysisView display={analysis.display} sources={analysis.sources} closestCase={closestCase} dense={dense} />;
}
