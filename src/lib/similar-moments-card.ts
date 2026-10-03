/**
 * The two lines on the Research card's "Similar moments" box, from ONE count.
 *
 * The header said "12 counted" while the body said "No close historical analog on
 * record" - two different sources (the case count the history was built from, and
 * whether a single closest analog row is attached) answering one question, and
 * contradicting each other (audit 2026-10-02, item 5.3). The body is now derived
 * from the same count: with cases it says how they were counted and where to see
 * them, and only with none does it say there is no analog.
 */
export function similarMomentsCard(input: {
  caseCount: number;
  kind: "direction" | "baseline" | "earnings" | "legacy" | "none";
  /** A closest analog row is attached and will be drawn. */
  hasAnalog: boolean;
}): { counted: string; empty: string | null } {
  const n = Math.max(0, Math.floor(input.caseCount));
  const counted = n > 0 ? `${n} counted` : "none counted";
  if (input.hasAnalog) return { counted, empty: null };
  if (n === 0) return { counted, empty: "No close historical analog on record." };
  const cases = `${n} past ${n === 1 ? "case was" : "cases were"} counted`;
  if (input.kind === "baseline") return { counted, empty: `${cases} from every stretch of past history, not only moments like today. Open the full analysis for the figures.` };
  return { counted, empty: `${cases}. Open the full analysis to see how they were chosen.` };
}


