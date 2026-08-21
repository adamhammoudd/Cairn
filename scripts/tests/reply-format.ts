// Unit test for the chat reply formatter (src/lib/ai/reply-format.ts).
//
// The cases that matter are taken from a real reply. Before this existed,
// asking "what do you think about nvidia" returned a six-row markdown table and
// four bold bullets, which the chat bubble - pre-wrap, no markdown renderer -
// printed to the user as literal pipes and asterisks.
//
// The other half of the suite guards the opposite mistake: this runs on text
// that has already passed the scope guard, so it must not alter wording. A
// formatter that quietly ate a caveat would invalidate a compliance check that
// had already passed.
//
// Run: npm run test:reply-format

import { toPlainProse } from "@/lib/ai/reply-format";
import type { SuiteResult, TestCase } from "./report";

function check(name: string, ok: boolean, detail: string): TestCase {
  return { name, status: ok ? "pass" : "fail", detail };
}

export function runReplyFormatSuite(): SuiteResult {
  const cases: TestCase[] = [];

  // ---- the failure actually observed in the product ----
  const realTable = [
    "Here are the headlines on file:",
    "",
    "| Date (UTC) | Headline (source) | Key theme |",
    "|------------|-------------------|-----------|",
    "| 2026-08-20 | “Is AMD Catching Up With Nvidia?” (Yahoo Finance) | Competitive comparison. |",
    "| 2026-08-19 | “Why Is NVDA The Discount Option?” (Yahoo Finance) | Valuation debate. |",
  ].join("\n");
  const flattened = toPlainProse(realTable);
  cases.push(
    check(
      "a markdown table leaves no pipe characters in the bubble",
      !flattened.includes("|"),
      JSON.stringify(flattened.slice(0, 90)),
    ),
  );
  cases.push(
    check(
      "the table's content survives flattening",
      flattened.includes("Is AMD Catching Up With Nvidia?") && flattened.includes("Valuation debate."),
      "headline and theme both retained",
    ),
  );
  cases.push(
    check("the |---|---| separator row is dropped entirely", !flattened.includes("---"), "no separator residue"),
  );

  // ---- the other observed defect: bold bullets ----
  const bullets = "* **AI demand:** GPUs are in demand.\n* **Valuation:** framed as a discount.";
  const debulleted = toPlainProse(bullets);
  cases.push(
    check(
      "bullet markers and bold markers are both removed",
      !debulleted.includes("*") && debulleted.includes("AI demand:"),
      JSON.stringify(debulleted),
    ),
  );
  cases.push(
    check(
      "each bullet keeps its own line rather than running together",
      debulleted.split("\n").length === 2,
      `${debulleted.split("\n").length} lines`,
    ),
  );

  // ---- the mock's own reply must pass through untouched ----
  const mockReply =
    "Your portfolio is up 1.24% today - $1,417 on $115,686. NVDA (+2.8%) and AMD (+3.2%) contributed nearly all of it; VTI is the only drag at -0.21%.\n\n" +
    "AMD remains your one position underwater on cost basis, -11.0% against an average entry of $189.20. Below is the market-level probability context for the NVDA move, with its inputs shown.";
  cases.push(
    check(
      "the mock-up's REPLY is returned byte-for-byte unchanged",
      toPlainProse(mockReply) === mockReply,
      "no-op on already-correct prose",
    ),
  );
  cases.push(
    check("the blank line between the two paragraphs is preserved", toPlainProse(mockReply).includes("\n\n"), "intact"),
  );

  // ---- must not alter wording (the scope guard already ran on this text) ----
  const caveated =
    "Historical analogs put the range at 18-24%, with high confidence. This is market-level context, not a recommendation to buy, hold, or sell.";
  cases.push(
    check("a compliance caveat is never stripped or reworded", toPlainProse(caveated) === caveated, "verbatim"),
  );
  cases.push(
    check(
      "hyphenated ranges and negative numbers are untouched",
      toPlainProse("Down -0.21% on a 3-5 day view.") === "Down -0.21% on a 3-5 day view.",
      "no mangling of - inside prose",
    ),
  );
  // A lone asterisk or underscore is not emphasis, and treating it as such
  // would silently delete a character from the user's answer.
  cases.push(
    check(
      "a lone asterisk inside a word is left alone",
      toPlainProse("Rated 5* by the desk.") === "Rated 5* by the desk.",
      "unpaired marker preserved",
    ),
  );
  cases.push(
    check(
      "snake_case survives the italics rule",
      toPlainProse("The price_to_earnings field.") === "The price_to_earnings field.",
      "intra-word underscore preserved",
    ),
  );

  // ---- remaining markdown syntax ----
  cases.push(check("headings lose the # but keep the text", toPlainProse("## Summary") === "Summary", "flattened"));
  cases.push(
    check(
      "inline code loses the backticks",
      toPlainProse("The `ai_analyses` table.") === "The ai_analyses table.",
      "backticks stripped",
    ),
  );
  cases.push(
    check(
      "a markdown link keeps its label and drops the URL syntax",
      toPlainProse("See [the filing](https://example.com/x).") === "See the filing.",
      "flattened to label",
    ),
  );
  cases.push(
    check(
      "numbered lists lose the marker",
      toPlainProse("1. First point.\n2. Second point.") === "First point.\nSecond point.",
      "ordinals stripped",
    ),
  );
  cases.push(
    check("a horizontal rule is removed", !toPlainProse("Above.\n\n---\n\nBelow.").includes("---"), "rule dropped"),
  );
  cases.push(
    check(
      "stripping never leaves a run of blank lines behind",
      !/\n{3,}/.test(toPlainProse("A.\n\n\n\n\nB.")),
      "collapsed to one",
    ),
  );
  cases.push(check("empty input stays empty", toPlainProse("") === "", "no crash on empty string"));

  return { suiteName: "Chat reply formatting (mock-up parity)", gating: true, cases };
}

if (process.argv[1] && process.argv[1].endsWith("reply-format.ts")) {
  const suite = runReplyFormatSuite();
  for (const c of suite.cases) console.log(`${c.status === "pass" ? "pass " : "FAIL "} ${c.name} - ${c.detail}`);
  const failed = suite.cases.filter((c) => c.status === "fail").length;
  console.log(`\n${suite.cases.length - failed}/${suite.cases.length} reply-format cases passed`);
  process.exit(failed === 0 ? 0 : 1);
}
