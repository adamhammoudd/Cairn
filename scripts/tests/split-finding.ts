// Tests for splitFinding() in src/components/analysis/methodology-card.tsx.
//
// The regression: a long or punctuation-free first "sentence" used to fall
// back to putting the WHOLE reasoning_text into the title, leaving body empty
// - a description bleeding entirely into the title, exactly the defect a
// reader flagged from the ticker page. splitFinding() must always leave a real
// description behind once the source text is longer than a title should be.

import { splitFinding } from "../../src/components/analysis/split-finding";
import type { SuiteResult, TestCase } from "./report";

const cases: TestCase[] = [];

function check(name: string, ok: boolean, detail: string) {
  cases.push({ name, status: ok ? "pass" : "fail", detail });
}

// --- the common case: an early sentence break is untouched -----------------
{
  const { finding, body } = splitFinding("AAPL is likely to drift higher. Historically this has held over two weeks.");
  check("short first sentence becomes the title", finding === "AAPL is likely to drift higher.", finding);
  check("short first sentence leaves the rest as body", body === "Historically this has held over two weeks.", body);
}

// --- a single sentence with nothing after it: body is legitimately empty ---
{
  const { finding, body } = splitFinding("AAPL is likely to drift higher.");
  check("a lone sentence is the whole title", finding === "AAPL is likely to drift higher.", finding);
  check("a lone sentence has no body to lose", body === "", JSON.stringify(body));
}

// --- the regression: a long, punctuation-free run-on ------------------------
{
  const longRunOn =
    "AAPL shares have historically responded positively following quarters where iPhone revenue exceeded consensus estimates by more than three percent and services revenue grew year over year while gross margin held above forty five percent across the trailing four quarters with no signs of deceleration in any single geographic segment reported by the company";
  const { finding, body } = splitFinding(longRunOn);
  check("long run-on: title stays title-sized", finding.length <= 225, `title is ${finding.length} chars: "${finding}"`);
  check("long run-on: body is not empty - nothing gets lost", body.length > 0, `body: "${body}"`);
  // Joining with exactly one space (the crop happens at a space in the
  // source) must reconstruct the original - which also proves the crop landed
  // on a real word boundary rather than slicing a word in half.
  check(
    "long run-on: title + body reconstruct the source at a clean word boundary",
    `${finding.replace(/…$/, "")} ${body}`.replace(/\s+/g, " ").trim() === longRunOn.replace(/\s+/g, " ").trim(),
    `title="${finding}" body="${body}"`,
  );
}

// --- an early sentence break exists, but that first sentence is itself huge ---
{
  const longFirstSentence =
    "The Q3 print showed iPhone revenue beating consensus by four percent, services growing eighteen percent year over year, gross margin expanding sixty basis points, and management raising full year guidance across every reporting segment they break out for investors. The stock has drifted higher in the two weeks after each of the last six comparable prints.";
  const { finding, body } = splitFinding(longFirstSentence);
  check("long-first-sentence: title stays title-sized", finding.length <= 225, `title is ${finding.length} chars`);
  check("long-first-sentence: body is not empty", body.length > 0, `body: "${body}"`);
}

// --- boundary: exactly at TITLE_MAX should still use the sentence split ----
{
  const exact = `${"A".repeat(218)}. Rest.`; // "A"*218 + ". " -> first sentence is 219 chars, well under 220
  const { finding, body } = splitFinding(exact);
  check("at the boundary, the real sentence break still wins", finding === "A".repeat(218) + ".", `${finding.length} chars`);
  check("at the boundary, body survives", body === "Rest.", body);
}

export function runSplitFindingSuite(): SuiteResult {
  return { suiteName: "Analysis card title/description split", gating: true, cases };
}

if (process.argv[1] && process.argv[1].endsWith("split-finding.ts")) {
  for (const c of cases) console.log(`${c.status === "pass" ? "ok  " : "FAIL"} ${c.name} - ${c.detail}`);
  const failed = cases.filter((c) => c.status === "fail").length;
  console.log(`\n${cases.length - failed}/${cases.length} split-finding cases passed`);
  process.exit(failed === 0 ? 0 : 1);
}
