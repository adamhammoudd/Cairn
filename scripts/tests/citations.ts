// Regression test for lib/ai/citations.ts - the 2026-09-04 walkthrough's
// finding #3: chat answers sometimes rendered a raw citation marker as
// literal text, e.g.
//   "...as big-tech stocks near record highs 【0568bbc0-05bf-4862-a426-166a8350c6c3】."
// instead of a real source link, while the "Elevated Move Likelihood"
// probability card in the same response rendered its own sources correctly.
//
// Run: npx tsx --conditions=react-server scripts/tests/citations.ts

import { resolveCitations, type CitableSource } from "../../src/lib/ai/citations";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "pass" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
  ok ? pass++ : fail++;
}

const SOURCES: CitableSource[] = [
  { id: "0568bbc0-05bf-4862-a426-166a8350c6c3", title: "Big tech nears record highs", url: "https://example.com/a" },
  { id: "37577c02-70ce-4897-b9cd-edf72c7025d0", title: "Rally broadens beyond mega-caps", url: "https://example.com/b" },
  { id: "no-url-source", title: "A source with no url on file", url: null },
];

// --- 1. The exact reported failure: two markers in one reply -----------------
{
  const raw =
    "...as big-tech stocks near record highs 【0568bbc0-05bf-4862-a426-166a8350c6c3】. " +
    "The broader rally is reinforced... 【37577c02-70ce-4897-b9cd-edf72c7025d0】.";
  const out = resolveCitations(raw, SOURCES);
  check("no raw 【...】 marker survives", !out.includes("【") && !out.includes("】"), out);
  check("no raw UUID survives as bare text either", !/[0-9a-f-]{36}/.test(out), out);
  check(
    "first marker becomes a real markdown link",
    out.includes("[Big tech nears record highs](https://example.com/a)"),
    out,
  );
  check(
    "second marker becomes a real markdown link",
    out.includes("[Rally broadens beyond mega-caps](https://example.com/b)"),
    out,
  );
}

// --- 2. A marker that matches no known source is dropped, not left dangling --
{
  const out = resolveCitations("Momentum is building 【not-a-real-id】 across the sector.", SOURCES);
  check("unresolvable id: bracket removed", !out.includes("【"), out);
  check("unresolvable id: no double space left behind", !out.includes("  "), out);
  check("unresolvable id: no space stranded before the period", !out.includes(" ."), out);
}

// --- 3. A resolvable id whose source has no url is dropped, never a dead link -
{
  const out = resolveCitations("As noted 【no-url-source】, sentiment shifted.", SOURCES);
  check("known id but no url: still dropped, not a broken [x]() link", !out.includes("("), out);
  check("known id but no url: bracket gone", !out.includes("【"), out);
}

// --- 4. Text with no marker at all is returned untouched (the common case) ---
{
  const plain = "Semiconductors gave back 4.2% this week on guidance cuts.";
  check("no marker present: byte-for-byte unchanged", resolveCitations(plain, SOURCES) === plain);
}

// --- 5. Markdown links the model wrote itself are never touched --------------
{
  const withLink = "See [the filing](https://example.com/filing) for detail.";
  check("a real markdown link is left alone", resolveCitations(withLink, SOURCES) === withLink);
}

// --- 6. Empty source list: every marker still gets safely dropped ------------
{
  const out = resolveCitations("Momentum 【0568bbc0-05bf-4862-a426-166a8350c6c3】 continues.", []);
  check("no sources available at all: marker dropped, no crash", !out.includes("【"), out);
}

console.log(`\n${pass}/${pass + fail} citations cases passed`);
process.exit(fail === 0 ? 0 : 1);
