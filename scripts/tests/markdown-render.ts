// Unit test for the chat markdown parser (src/lib/ai/markdown.ts).
//
// The bubble renders assistant replies through parseBlocks/parseInline. The
// cases that matter: real structure is recognised, prose is left alone, link
// hrefs are scheme-checked, and half-streamed input (an unclosed **) degrades
// to literal text rather than eating the rest of the line.
//
// Run: npm run test:markdown-render

import { parseBlocks, parseInline, type InlineNode } from "@/lib/ai/markdown";
import type { SuiteResult, TestCase } from "./report";

function check(name: string, ok: boolean, detail: string): TestCase {
  return { name, status: ok ? "pass" : "fail", detail };
}

function plain(nodes: InlineNode[]): string {
  return nodes
    .map((n) => {
      if (n.type === "text") return n.value;
      if (n.type === "code") return n.value;
      if (n.type === "link") return n.label;
      return plain(n.children);
    })
    .join("");
}

export function runMarkdownRenderSuite(): SuiteResult {
  const cases: TestCase[] = [];

  // ---- blocks ----
  const doc = parseBlocks("## Outlook\n\nNVDA is **up 2.8%**.\n\n- demand strong\n- supply tight\n\n---\n\n1. first\n2. second");
  cases.push(check("a heading block is recognised with its level", doc[0].type === "heading" && (doc[0] as { level: number }).level === 2, JSON.stringify(doc[0])));
  cases.push(check("a paragraph block follows", doc[1].type === "paragraph", doc[1].type));
  cases.push(
    check(
      "an unordered list groups its items",
      doc[2].type === "list" && !(doc[2] as { ordered: boolean }).ordered && (doc[2] as { items: unknown[] }).items.length === 2,
      JSON.stringify(doc[2]),
    ),
  );
  cases.push(check("a horizontal rule is its own block", doc[3].type === "rule", doc[3].type));
  cases.push(
    check(
      "an ordered list is flagged ordered",
      doc[4].type === "list" && (doc[4] as { ordered: boolean }).ordered && (doc[4] as { items: unknown[] }).items.length === 2,
      JSON.stringify(doc[4]),
    ),
  );

  // ---- inline ----
  const strong = parseInline("NVDA is **up 2.8%** today");
  cases.push(check("bold is parsed to a strong node", strong.some((n) => n.type === "strong"), JSON.stringify(strong)));
  cases.push(check("text around bold is preserved", plain(strong) === "NVDA is up 2.8% today", plain(strong)));

  const link = parseInline("See [the 8-K](https://sec.gov/x) here");
  cases.push(
    check(
      "a markdown link keeps label and href",
      link.some((n) => n.type === "link" && n.href === "https://sec.gov/x" && n.label === "the 8-K"),
      JSON.stringify(link),
    ),
  );

  const jsLink = parseInline("[click](javascript:alert(1))");
  cases.push(
    check("a non-http(s) link scheme is refused and left as text", !jsLink.some((n) => n.type === "link"), JSON.stringify(jsLink)),
  );

  const bare = parseInline("source: https://example.com/a, and more");
  cases.push(check("a bare URL is autolinked", bare.some((n) => n.type === "link" && n.href === "https://example.com/a"), JSON.stringify(bare)));

  cases.push(check("snake_case is not italicised", plain(parseInline("the price_to_earnings field")) === "the price_to_earnings field", "intact"));
  cases.push(check("a 5* rating is not italicised", plain(parseInline("rated 5* by the desk")) === "rated 5* by the desk", "intact"));
  cases.push(
    check(
      "an unclosed bold marker degrades to literal text",
      plain(parseInline("NVDA is **up and to the right")) === "NVDA is **up and to the right",
      "no line swallowed",
    ),
  );
  cases.push(
    check(
      "a hyphenated range is never a list or emphasis",
      plain(parseInline("range is 18-24% on a 3-5 day view")) === "range is 18-24% on a 3-5 day view",
      "intact",
    ),
  );

  return { suiteName: "Chat markdown parser", gating: true, cases };
}

if (process.argv[1] && process.argv[1].endsWith("markdown-render.ts")) {
  const suite = runMarkdownRenderSuite();
  for (const c of suite.cases) console.log(`${c.status === "pass" ? "pass " : "FAIL "} ${c.name} - ${c.detail}`);
  const failed = suite.cases.filter((c) => c.status === "fail").length;
  console.log(`\n${suite.cases.length - failed}/${suite.cases.length} markdown-render cases passed`);
  process.exit(failed === 0 ? 0 : 1);
}
