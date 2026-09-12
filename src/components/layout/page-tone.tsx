"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/**
 * Lets the chart on a page tell the shell which way it is pointing, so the
 * corner wash can take the same colour as the line.
 *
 * It has to be reported rather than derived: every one of these charts decides
 * its own colour from the *selected range* (`values[last] >= values[0]` on
 * Base Camp, `rangeChange >= 0` on Portfolio and the ticker), so the answer
 * changes when someone switches 1W to 1Y. Computing it a second time in the
 * shell would be a second source of truth that could disagree with the line
 * the wash is meant to match.
 *
 * A page with no directional chart never reports, and the wash falls back to
 * its route colours.
 */

export type PageTone = "positive" | "negative";

const PageToneContext = createContext<{
  tone: PageTone | null;
  report: (tone: PageTone | null) => void;
}>({ tone: null, report: () => {} });

export function PageToneProvider({ children }: { children: ReactNode }) {
  const [tone, setTone] = useState<PageTone | null>(null);
  return <PageToneContext.Provider value={{ tone, report: setTone }}>{children}</PageToneContext.Provider>;
}

/** Read side, for the wash. */
export function usePageTone(): PageTone | null {
  return useContext(PageToneContext).tone;
}

/**
 * Write side, for a chart. Clears on unmount so navigating from a page with a
 * chart to one without does not leave the previous page's colour behind.
 */
export function useReportPageTone(tone: PageTone | null) {
  const { report } = useContext(PageToneContext);
  useEffect(() => {
    report(tone);
    return () => report(null);
  }, [tone, report]);
}
