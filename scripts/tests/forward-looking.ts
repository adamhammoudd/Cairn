// Audit 2026-10-02 item 3.11: a Research card headline read "Microsoft shares
// have risen sharply and may keep climbing for a while" - a market-direction
// forecast hedged with "may". The existing prediction check (STATED_AS_FACT)
// caught "will rise" and "is set to fall" but not a modal. hasForwardLooking
// now rejects it in both text checkers (analysis text and plain summary).
//
// Stored headlines are NOT rewritten by this change. Where the old ones can be
// found, the PR lists them (scripts/audit-stored-forward-looking.ts, read-only).
//
// Run: npx tsx --conditions=react-server scripts/tests/forward-looking.ts

import fs from "node:fs";
import path from "node:path";
import { hasForwardLooking, forwardLookingMatch } from "../../src/lib/ai/forward-looking";
import { checkAnalysisText, templateAnalysisText, type TextInputs } from "../../src/lib/ai/analysis-text";
import { checkSummaryText } from "../../src/lib/ai/plain-summary";
import { makeSuite, runIfMain } from "./mini";
import type { SuiteResult } from "./report";

const INPUTS = JSON.parse(fs.readFileSync(path.resolve(__dirname, "fixtures/analysis-inputs.json"), "utf8")).inputs as Record<string, TextInputs>;

const MUST_REJECT = [
  "Microsoft shares have risen sharply and may keep climbing for a while",
  "The share could fall further from here.",
  "The price might still drop before results.",
  "Shares are likely to rise after the report.",
  "Shares are expected to fall next week.",
  "It is expected to rise.",
  "The coin may continue to rally.",
  "The stock will keep going up.",
  "More upside to come for the sector.",
  "Further losses are likely.",
  "The shares look set for a rally.",
  "It could head lower.",
  "This may well extend its gains.",
];

const MUST_PASS = [
  "Microsoft shares have risen sharply over the past month.",
  "The shares rose 4% last week.",
  "Earnings will be reported on 5 November.",
  "The company is expected to report results on 5 Nov.",
  "In 14 of 20 similar past cases, the share was higher ten sessions later.",
  "Sales are up 18% on last year.",
  "A drop of this size has happened 6 times in 20 years.",
  "It could be argued that the score is mixed.",
  "The dividend was raised for the third year running.",
  "Revenue grew while profit fell.",
];

export function runForwardLookingSuite(): SuiteResult {
  const { check, result } = makeSuite("Forward-looking direction check (headlines and summaries)");

  for (const t of MUST_REJECT) check(`rejects: "${t}"`, hasForwardLooking(t), forwardLookingMatch(t) ?? "no match");
  for (const t of MUST_PASS) check(`allows: "${t}"`, !hasForwardLooking(t), forwardLookingMatch(t) ?? "");

  // The reported sentence, through the real checkers.
  const base = INPUTS.MSFT ?? Object.values(INPUTS)[0];
  const bad = "Microsoft shares have risen sharply and may keep climbing for a while.";
  const before = checkAnalysisText({ ...templateAnalysisText(base), headline: bad }, base, { minWatch: 0 });
  check("the Research card headline is rejected as forward_looking", !before.passed && before.reason === "forward_looking", JSON.stringify(before));

  const tpl = templateAnalysisText(base);
  check("(control) the template text for the same inputs still passes", checkAnalysisText(tpl, base, { minWatch: 0 }).passed);

  // The same sentence in a bullet and in the plain summary.
  const inBullet = checkAnalysisText({ ...tpl, bullets: [tpl.bullets[0], tpl.bullets[1], "Shares could fall further."] }, base, { minWatch: 0 });
  check("a hedged forecast in a bullet is rejected too", !inBullet.passed && inBullet.reason === "forward_looking", JSON.stringify(inBullet));
  const summary = checkSummaryText({ headline: bad, bullets: ["The scorecard is mixed.", "Sales are up.", "Debt is low."] }, { name: "Microsoft", symbol: "MSFT" } as never);
  check("the plain summary check rejects it as forward_looking", !summary.passed && summary.reason === "forward_looking", JSON.stringify(summary));

  // No false positives on the real template text for ten tickers.
  const flagged: string[] = [];
  for (const [sym, i] of Object.entries(INPUTS)) {
    const t = templateAnalysisText(i);
    for (const p of [t.headline, ...t.bullets, ...t.watch.map((w) => w.text)]) if (hasForwardLooking(p)) flagged.push(`${sym}: ${p}`);
  }
  check(`no template sentence for ${Object.keys(INPUTS).length} real tickers is flagged`, flagged.length === 0, flagged.slice(0, 3).join(" | "));
  return result();
}

void runIfMain(import.meta.url, runForwardLookingSuite);
