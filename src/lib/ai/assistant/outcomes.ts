// What a tool outcome amounts to, in one place (fix/assistant-empty-answers).
//
// The guard (an honest "nothing was found" needs no citation), the fallback
// answer (which says what happened) and the "Checked:" line all ask the same
// questions of a tool outcome: did it run, did it find anything, why not.

import type { ToolOutcome } from "@/lib/ai/assistant/types";

/** The tool ran fine and found nothing: no sources, no facts, no figures. */
export const isEmptyOutcome = (o: ToolOutcome): boolean => o.ok && o.sources.length === 0 && o.facts.length === 0 && o.tiles.length === 0;

/** Empty, or failed: the outcome backs a sentence that says nothing was found. */
export const foundNothing = (o: ToolOutcome): boolean => !o.ok || isEmptyOutcome(o);

/** Web search was switched off: no request was sent. */
export const webWasOff = (o: ToolOutcome): boolean => o.name === "web_search" && !o.ok && o.notRun === true;

/** What the "Checked:" line says about one outcome - failures and empty results included, nothing hidden. */
export function checkedLabel(o: ToolOutcome): string {
  if (o.name === "web_search" && !o.ok) {
    if (o.notRun) return "web search: not switched on";
    return /no citable/i.test(o.error ?? "") ? "web search: found nothing" : "web search: failed";
  }
  if (!o.ok) return `${o.label}: couldn't be read`;
  if (isEmptyOutcome(o)) return `${o.label}: nothing found`;
  return o.label;
}
