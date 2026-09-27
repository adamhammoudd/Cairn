// Assistant v2 answer guards (lib/ai/assistant/guards.ts): must-pass and
// must-flag cases for the figure allow-list, the scope checks and citations.
//
// Run: npx tsx --conditions=react-server scripts/tests/assistant-guards.ts

import { pathToFileURL } from "node:url";
import { allowedNumbers, checkAnswer, checkCitations, checkFigures, checkScope, unsourcedNumbers } from "@/lib/ai/assistant/guards";
import type { AnswerDraft, AssistantSource, ToolOutcome } from "@/lib/ai/assistant/types";
import { writeReport, type SuiteResult, type TestCase } from "./report";

const outcome = (name: ToolOutcome["name"], data: unknown, ok = true): ToolOutcome => ({ name, args: {}, ok, label: name, data, sources: [], facts: [], tiles: [], ms: 1 });

const TOOLS: ToolOutcome[] = [
  outcome("get_price_summary", { symbol: "NVDA", price: "$178.43", today: "+2.1%", change: { week: "+4.3%", "1 year": "+41.5%" }, as_of: "Fri 25 Sep" }),
  outcome("get_history_outcome", { result: "Higher 2 weeks later in 13 of 17 similar moments." }),
  outcome("get_company_numbers", { figures: { revenue: "$165.2B", free_cash_flow: "$78.9B" }, dividends_as_share_of_free_cash_flow: "34%" }),
];
const WITH_PORTFOLIO = [...TOOLS, outcome("get_portfolio", { total_value: "$7,562.19", holdings: [{ symbol: "NVDA", weight: "28.3%", value: "$2,141.16" }] })];
const SOURCES: AssistantSource[] = [
  { n: 1, kind: "news", title: "Nvidia extends winning streak", publisher: "Yahoo Finance", url: "https://finance.yahoo.com/n1", date: "2026-09-24" },
  { n: 2, kind: "web", title: "Chip export talks resume", publisher: "reuters.com", url: "https://www.reuters.com/x", date: null },
];

const draft = (lead: string, extra: Partial<AnswerDraft> = {}): AnswerDraft => ({ lead, tiles: [], sections: [], follow_ups: ["What next?", "Any news?"], ...extra });

export function runAssistantGuardsSuite(): SuiteResult {
  const cases: TestCase[] = [];
  const expect = (name: string, ok: boolean, detail: string) => cases.push({ name, status: ok ? "pass" : "fail", detail });

  // ---- figures ------------------------------------------------------------------
  const allowed = allowedNumbers(TOOLS);
  const mustPassFigures = [
    "NVIDIA's share is at $178.43, +2.1% today and +41.5% over a year.",
    "Higher 2 weeks later in 13 of 17 similar moments.",
    "Revenue over the last four quarters was $165.2B and free cash flow $78.9B; dividends took 34% of it.",
    "Its results are due in Q3, as its 10-Q and the S&P 500 show.", // numbers inside names
    "The last 3 headlines all mention chips.", // a small count
    "The share hit its high in 2025.", // a year
    "Figures as of Fri 25 Sep [1].",
  ];
  for (const t of mustPassFigures) {
    const bad = unsourcedNumbers(t, allowed);
    expect(`figures must PASS: "${t}"`, bad.length === 0, bad.join(", ") || "clean");
  }
  const mustFlagFigures: [string, string][] = [
    ["NVIDIA's share is at $178.40.", "$178.40"], // rounded
    ["It is up about 42% over a year.", "42%"], // rounded percent
    ["It could reach $250 by year end.", "$250"], // invented target
    ["Analysts expect earnings of $1.02 a share.", "$1.02"], // from memory
    ["Revenue was $165B.", "$165"], // re-rounded big number
    ["It has 24.4 billion shares.", "24.4"],
    ["Down 7% this month.", "7%"], // a small number WITH % is a figure, not a count
  ];
  for (const [t, expected] of mustFlagFigures) {
    const bad = unsourcedNumbers(t, allowed);
    expect(`figures must FLAG: "${t}"`, bad.some((b) => b.includes(expected.replace(/^\$/, "")) || b === expected), bad.join(", ") || "not flagged");
  }
  expect("checkFigures covers tiles too", !checkFigures(draft("NVIDIA today.", { tiles: [{ label: "Target", value: "$250.00" }] }), TOOLS).passed, "tile $250.00");

  // ---- scope -----------------------------------------------------------------------
  const mustPassScope = [
    "Cairn doesn't tell anyone whether to buy, hold or sell - here is what the numbers say.",
    "I can't tell you whether you should sell NVDA, but here is how it has done.",
    "Your portfolio is worth $7,562.19; NVIDIA is 28.3% of it.",
    "Your NVIDIA shares are worth $2,141.16.",
    "Higher 2 weeks later in 13 of 17 similar moments. That is what happened before, not a forecast.",
    'Yahoo Finance ran "Should you buy Nvidia before earnings?" this week [1].', // a quoted headline is reported text
  ];
  for (const t of mustPassScope) {
    const r = checkScope(draft(t), WITH_PORTFOLIO);
    expect(`scope must PASS: "${t}"`, r.passed, `${r.reason ?? ""} ${r.evidence ?? ""}`);
  }
  const mustFlagScope = [
    "You should sell NVDA before earnings.",
    "Now looks like a good time to add to NVIDIA.",
    "NVIDIA will rise after results.",
    "The share is likely to stay higher into November.",
    "NVIDIA looks undervalued here.",
    "Your portfolio is too concentrated in NVIDIA.",
    "Consider trimming your NVDA position.",
    "It's a safe bet for the long term.",
  ];
  for (const t of mustFlagScope) {
    const r = checkScope(draft(t), WITH_PORTFOLIO);
    expect(`scope must FLAG: "${t}"`, !r.passed, r.reason ?? "not flagged");
  }
  const noPortfolio = checkScope(draft("NVIDIA is at $178.43.", { sections: [{ heading: "For you", body: "You hold it." }] }), TOOLS);
  expect("a 'For you' section without a portfolio read is rejected", !noPortfolio.passed && noPortfolio.reason === "for_you_without_portfolio", String(noPortfolio.reason));

  // ---- citations -----------------------------------------------------------------------
  const cited = draft("Here's the news.", { sections: [{ heading: "What's happening", body: "Nvidia extended its winning streak [1]. Export talks resumed [2]." }] });
  expect("citations must PASS: every news sentence cites a real source", checkCitations(cited, SOURCES).passed, JSON.stringify(checkCitations(cited, SOURCES)));
  const uncited = draft("Here's the news.", { sections: [{ heading: "What's happening", body: "Nvidia extended its winning streak [1]. Export talks resumed." }] });
  expect("citations must FLAG: an uncited news sentence", checkCitations(uncited, SOURCES).reason === "uncited_news_claim", String(checkCitations(uncited, SOURCES).reason));
  const ghost = draft("Here's the news.", { sections: [{ heading: "What's happening", body: "Something happened [7]." }] });
  expect("citations must FLAG: a citation to a source that doesn't exist", checkCitations(ghost, SOURCES).reason === "citation_to_unknown_source", String(checkCitations(ghost, SOURCES).reason));
  const reported = draft("Reuters reported a deal.", { sections: [{ heading: "The business", body: "Reuters reported a supply deal." }] });
  expect("citations must FLAG: 'reported' outside the news section without a citation", checkCitations(reported, SOURCES).reason === "uncited_news_claim", String(checkCitations(reported, SOURCES).reason));

  // ---- the whole answer --------------------------------------------------------------
  const good = draft("NVIDIA's share is at $178.43, +41.5% over a year.", {
    tiles: [{ label: "NVDA price", value: "$178.43" }],
    sections: [
      { heading: "What's happening", body: "Nvidia extended its winning streak [1]." },
      { heading: "What history says", body: "Higher 2 weeks later in 13 of 17 similar moments." },
    ],
  });
  expect("a well-formed answer passes checkAnswer", checkAnswer(good, TOOLS, SOURCES).passed, JSON.stringify(checkAnswer(good, TOOLS, SOURCES)));
  expect("an empty lead fails", checkAnswer(draft(""), TOOLS, SOURCES).reason === "structure", "structure");

  return { suiteName: "Assistant v2 guards (figures from tools, no advice, real citations)", gating: true, cases };
}

async function main() {
  const suite = runAssistantGuardsSuite();
  console.log(`Report written to ${writeReport([suite])}`);
  const failed = suite.cases.filter((c) => c.status === "fail");
  for (const c of failed) console.log(`FAIL: ${c.name} - ${c.detail}`);
  console.log(`${suite.cases.length - failed.length}/${suite.cases.length} passed.`);
  if (failed.length > 0) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
