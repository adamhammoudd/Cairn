// A direction forecast phrased as a possibility ("may keep climbing", "could
// fall further", "likely to rise", "more upside to come").
//
// Cairn describes what happened and what past cases looked like; it does not
// forecast market direction. STATED_AS_FACT (analysis-text.ts) already rejects
// "will rise" / "is set to fall" / "likely to be higher", but a headline on a
// Research card read "Microsoft shares have risen sharply and may keep climbing
// for a while" - the same forecast, hedged with a modal verb, which slipped
// through (audit 2026-10-02, item 3.11).
//
// The rule is deliberately narrow: a modal or expectation word followed, within
// a couple of words, by a verb of market DIRECTION. "Earnings will be reported on
// 5 November" and "The shares rose sharply" are fine; "may keep climbing",
// "could drop", "expected to rise" are not.

const DIRECTION =
  "(?:rise|rising|rises|fall|falling|falls|climb|climbing|climbs|drop|dropping|drops|gain|gaining|gains|lose|losing|rally|rallying|surge|surging|soar|soaring|jump|jumping|sink|sinking|slide|sliding|slump|slumping|decline|declining|increase|increasing|decrease|decreasing|recover|recovering|rebound|rebounding|bounce|advance|advancing|extend\\s+(?:its|the)\\s+(?:gains?|losses|rally|decline)|move\\s+(?:higher|lower|up|down)|go\\s+(?:higher|lower|up|down)|head\\s+(?:higher|lower|up|down)|trade\\s+(?:higher|lower)|push\\s+(?:higher|lower))";

const MODAL =
  "(?:may|might|could|can|should|would|will|won't|shall|likely\\s+to|unlikely\\s+to|expected\\s+to|set\\s+to|poised\\s+to|bound\\s+to|due\\s+to|on\\s+track\\s+to|going\\s+to|looks?\\s+to|seems?\\s+to|appears?\\s+to|tends?\\s+to|probably|possibly|perhaps)";

const FORWARD_LOOKING = new RegExp(
  [
    // "may keep climbing", "could continue to fall", "is likely to rise", "might still drop"
    `\\b${MODAL}\\s+(?:well\\s+|also\\s+|still\\s+|yet\\s+|even\\s+|just\\s+)?(?:keep\\s+(?:on\\s+)?|continue\\s+(?:to\\s+)?|go\\s+on\\s+to\\s+|carry\\s+on\\s+)?(?:\\w+\\s+){0,2}?${DIRECTION}\\b`,
    // "will keep going up"
    `\\b${MODAL}\\s+keep\\s+(?:going\\s+)?(?:up|down|higher|lower)\\b`,
    // "more upside to come", "further gains ahead", "more losses are likely"
    "\\b(?:more|further)\\s+(?:upside|downside|gains?|losses|weakness|strength)\\s+(?:to\\s+come|ahead|(?:is|are)\\s+(?:likely|possible|coming|expected))\\b",
    // "heading for a fall", "poised for a rally"
    "\\b(?:heading|headed|poised|on\\s+track|set|bound)\\s+for\\s+(?:a\\s+)?(?:rise|fall|drop|rally|decline|pullback|correction|breakout)\\b",
  ].join("|"),
  "i",
);

/** True when `text` forecasts market direction, even hedged ("may keep climbing"). */
export function hasForwardLooking(text: string): boolean {
  return FORWARD_LOOKING.test(text);
}

/** The matched phrase, for failure evidence and tests. */
export function forwardLookingMatch(text: string): string | null {
  const m = FORWARD_LOOKING.exec(text);
  return m ? m[0] : null;
}
