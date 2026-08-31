// Unit test for the chat reply normaliser (src/lib/ai/reply-format.ts).
//
// The chat bubble now renders real markdown, so the normaliser's job shrank to
// one thing: flatten pipe tables (which a 660px column cannot hold) to a
// bullet list, and leave every other markdown construct for the renderer.
//
// The other half of the suite guards the invariant that has always mattered:
// this runs on text that already passed the scope guard, so it must not alter
// wording. A normaliser that quietly ate a caveat would invalidate a
// compliance check that had already passed.
//
// Run: npm run test:reply-format

import { normalizeReply } from "@/lib/ai/reply-format";
import type { SuiteResult, TestCase } from "./report";

function check(name: string, ok: boolean, detail: string): TestCase {
  return { name, status: ok ? "pass" : "fail", detail };
}

export function runReplyFormatSuite(): SuiteResult {
  const cases: TestCase[] = [];

  // ---- pipe tables: the one thing still flattened ----
  const realTable = [
    "Here are the headlines on file:",
    "",
    "| Date (UTC) | Headline (source) | Key theme |",
    "|------------|-------------------|-----------|",
    "| 2026-08-20 | Is AMD Catching Up With Nvidia? (Yahoo Finance) | Competitive comparison. |",
    "| 2026-08-19 | Why Is NVDA The Discount Option? (Yahoo Finance) | Valuation debate. |",
  ].join("\n");
  const flattened = normalizeReply(realTable);
  cases.push(
    check("a markdown table leaves no pipe characters in the reply", !flattened.includes("|"), JSON.stringify(flattened.slice(0, 120))),
  );
  cases.push(
    check(
      "the table's content survives flattening",
      flattened.includes("Is AMD Catching Up With Nvidia?") && flattened.includes("Valuation debate."),
      "headline and theme both retained",
    ),
  );
  cases.push(check("the |---|---| separator row is dropped entirely", !flattened.includes("---"), "no separator residue"));
  cases.push(
    check(
      "each data row becomes its own bullet with the header labels paired in",
      flattened.split("\n").filter((l) => l.startsWith("- ")).length === 2 && flattened.includes("Date (UTC): 2026-08-20"),
      JSON.stringify(flattened),
    ),
  );

  // ---- markdown the renderer handles is now preserved, not stripped ----
  cases.push(check("a heading keeps its # marker", normalizeReply("## Summary") === "## Summary", "untouched"));
  cases.push(
    check("bold markers are preserved", normalizeReply("NVDA is **up 2.8%** today.") === "NVDA is **up 2.8%** today.", "untouched"),
  );
  cases.push(
    check(
      "a markdown link is preserved intact",
      normalizeReply("See [the filing](https://example.com/x).") === "See [the filing](https://example.com/x).",
      "untouched",
    ),
  );
  cases.push(
    check(
      "bullet lists keep their markers",
      normalizeReply("- AI demand strong\n- Valuation debated") === "- AI demand strong\n- Valuation debated",
      "untouched",
    ),
  );

  // ---- must not alter wording (the scope guard already ran on this text) ----
  const mockReply =
    "Your portfolio is up **1.24%** today - $1,417 on $115,686. NVDA (+2.8%) and AMD (+3.2%) contributed nearly all of it; VTI is the only drag at -0.21%.\n\n" +
    "AMD remains your one position underwater on cost basis, -11.0% against an average entry of $189.20. Below is the market-level probability context for the NVDA move, with its inputs shown.";
  cases.push(check("the expected reply shape is returned byte-for-byte unchanged", normalizeReply(mockReply) === mockReply, "no-op"));
  cases.push(check("the blank line between paragraphs is preserved", normalizeReply(mockReply).includes("\n\n"), "intact"));

  const caveated =
    "Historical analogs put the range at 18-24%, with high confidence. This is market-level context, not a recommendation to buy, hold, or sell.";
  cases.push(check("a compliance caveat is never stripped or reworded", normalizeReply(caveated) === caveated, "verbatim"));
  cases.push(
    check(
      "hyphenated ranges and negative numbers are untouched",
      normalizeReply("Down -0.21% on a 3-5 day view.") === "Down -0.21% on a 3-5 day view.",
      "no mangling",
    ),
  );
  cases.push(
    check("stripping never leaves a run of blank lines behind", !/\n{3,}/.test(normalizeReply("A.\n\n\n\n\nB.")), "collapsed to one"),
  );
  cases.push(check("empty input stays empty", normalizeReply("") === "", "no crash on empty string"));

  return { suiteName: "Chat reply normalisation", gating: true, cases };
}

if (process.argv[1] && process.argv[1].endsWith("reply-format.ts")) {
  const suite = runReplyFormatSuite();
  for (const c of suite.cases) console.log(`${c.status === "pass" ? "pass " : "FAIL "} ${c.name} - ${c.detail}`);
  const failed = suite.cases.filter((c) => c.status === "fail").length;
  console.log(`\n${suite.cases.length - failed}/${suite.cases.length} reply-format cases passed`);
  process.exit(failed === 0 ? 0 : 1);
}
