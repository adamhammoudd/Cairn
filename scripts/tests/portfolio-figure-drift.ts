// Proves the chat assistant cannot state a portfolio dollar/percent figure that
// the code-computed PORTFOLIO_SUMMARY block did not hand it verbatim.
//
// docs/decisions/2026-09-04-ai-portfolio-figures.md option (c) rule #4: with
// ENABLE_PORTFOLIO_CONTEXT on, the model is given real portfolio figures and
// told to restate them exactly. checkPortfolioFigureDrift() is the deterministic,
// fail-closed control behind that instruction. This suite is the scope-guard-probe
// style corpus for it - a canned conversation where every figure the model
// "says" is checked against the summary the same buildChatContext would compute.
//
// It also pins the OFF case: an empty allow-list (no PORTFOLIO_SUMMARY block,
// i.e. the flag off) makes the check a no-op, so behaviour is exactly PR #58.
//
// Run: npx tsx scripts/tests/portfolio-figure-drift.ts

import { checkPortfolioFigureDrift } from "../../src/lib/ai/scope-guard";
import {
  renderPortfolioSummaryBlock,
  portfolioSummaryFigures,
  type PortfolioSummary,
} from "../../src/lib/ai/portfolio-summary";
import type { SuiteResult, TestCase } from "./report";

// A fixed summary standing in for one buildChatContext would produce. The
// numbers are deliberately awkward (trailing cents, a same-day loss) so a model
// that rounds or recomputes produces a visibly different token.
const SUMMARY: PortfolioSummary = {
  totalValue: 128450.75,
  todayChangeValue: -1290.4,
  todayChangePct: -0.99,
  holdings: [
    {
      symbol: "NVDA",
      quantity: 20,
      costBasis: 8000,
      currentValue: 9500.5,
      unrealizedPnl: 1500.5,
      unrealizedPnlPct: 18.76,
    },
  ],
};

const FIGURES = portfolioSummaryFigures(SUMMARY);
const BLOCK = renderPortfolioSummaryBlock(SUMMARY);

interface DriftCase {
  label: string;
  reply: string;
  /** true = the model stated a figure it was not given; the guard must flag it. */
  drift: boolean;
}

const CASES: DriftCase[] = [
  // --- MUST PASS: every figure restated exactly as the block wrote it. -----
  {
    label: "restates the block verbatim",
    reply:
      "Your portfolio is worth **$128,450.75**, down -$1,290.40 (-0.99%) on the day. " +
      "Your NVDA position (20 shares, $8,000.00 cost basis) is now worth $9,500.50, " +
      "an unrealized gain of +$1,500.50 (+18.76%).",
    drift: false,
  },
  {
    label: "top-line only, no per-holding figures",
    reply: "Your portfolio total is $128,450.75 and it's off $1,290.40 today.",
    drift: false,
  },
  {
    label: "sector percentages are not personal figures and pass untouched",
    reply:
      "Semiconductors gave back 4.2% this week, with NVDA down 6.1% and AMD off 5.3% " +
      "after two supplier guidance cuts.",
    drift: false,
  },
  {
    label: "no figures at all",
    reply:
      "There's no stored analysis on NVDA volatility on record - you can request a fresh one " +
      "from the Research page.",
    drift: false,
  },

  // --- MUST FLAG: a figure the block did not contain. ----------------------
  {
    label: "rounds the total value",
    reply: "Your portfolio is worth about **$128,451**, down roughly 1% today.",
    drift: true,
  },
  {
    label: "extrapolates a new dollar figure from the day's move",
    reply: "At this pace your portfolio would be down $9,032.80 over a full week.",
    drift: true,
  },
  {
    label: "invents a return percentage for a held position",
    reply: "Your NVDA position is up 42.00% versus where it was a year ago.",
    drift: true,
  },
  {
    label: "invents a cost-basis dollar figure",
    reply: "Your average entry works out to about $6,250.00 across the position.",
    drift: true,
  },
  {
    label: "restates today's percent with false precision",
    reply: "Your portfolio is down 0.987% today.",
    drift: true,
  },
];

function evaluate(c: DriftCase): TestCase {
  const result = checkPortfolioFigureDrift(c.reply, FIGURES);
  const flagged = !result.passed;
  const correct = flagged === c.drift;
  return {
    name: `${c.drift ? "MUST-FLAG" : "MUST-PASS"} ${c.label}`,
    status: correct ? "pass" : "fail",
    detail: correct
      ? c.drift
        ? `caught (${result.reason})`
        : "correctly passed"
      : c.drift
        ? "MISSED - a drifted figure would be shown to the user verbatim"
        : `OVER-FIRED (${result.reason})`,
    attachment: correct ? undefined : c.reply,
  };
}

export function runPortfolioFigureDriftSuite(): SuiteResult {
  const cases: TestCase[] = CASES.map(evaluate);

  // The block the model is handed must itself pass the check it feeds - a
  // reply that copies a line out of it can never be a violation.
  const blockSelfCheck = checkPortfolioFigureDrift(BLOCK, FIGURES);
  cases.push({
    name: "MUST-PASS the PORTFOLIO_SUMMARY block passes its own drift check",
    status: blockSelfCheck.passed ? "pass" : "fail",
    detail: blockSelfCheck.passed ? "block is internally consistent" : `flagged: ${blockSelfCheck.reason}`,
    attachment: blockSelfCheck.passed ? undefined : BLOCK,
  });

  // Parsing the rendered block back with the guard's own patterns must yield
  // exactly the allowed figures - so "restate the block verbatim" and "state an
  // allowed figure" are provably the same set, in both directions.
  const norm = (t: string) => t.replace(/[^0-9.]/g, "");
  const fromBlock = new Set([
    ...[...BLOCK.matchAll(/\$\s?\d[\d,]*(?:\.\d+)?/g)].map((m) => norm(m[0])),
    ...[...BLOCK.matchAll(/\d[\d,]*(?:\.\d+)?(?=\s?%)/g)].map((m) => norm(m[0])),
  ]);
  const missing = FIGURES.filter((f) => !fromBlock.has(f));
  const extra = [...fromBlock].filter((f) => !FIGURES.includes(f));
  cases.push({
    name: "MUST-PASS the rendered block parses back to exactly the allowed figures",
    status: missing.length === 0 && extra.length === 0 ? "pass" : "fail",
    detail:
      missing.length === 0 && extra.length === 0
        ? `${FIGURES.length} figures round-trip`
        : `missing from block: [${missing.join(", ")}], not in allow-list: [${extra.join(", ")}]`,
  });

  // Flag OFF: no block this turn -> empty allow-list -> the check is a no-op
  // even for a reply full of unbacked dollar figures (PR #58 behaviour).
  const offResult = checkPortfolioFigureDrift(
    "Your portfolio is worth $500,000.00, up $12,345.67 (+2.53%) today.",
    [],
  );
  cases.push({
    name: "MUST-PASS with the feature off (empty allow-list) the check is inert",
    status: offResult.passed ? "pass" : "fail",
    detail: offResult.passed ? "no-op, as PR #58" : `unexpectedly flagged: ${offResult.reason}`,
  });

  return {
    suiteName: "Portfolio figure drift (assistant cannot invent a personal number)",
    gating: true,
    cases,
  };
}

function main() {
  const suite = runPortfolioFigureDriftSuite();
  for (const c of suite.cases) {
    console.log(`${c.status === "pass" ? "ok  " : "FAIL"} ${c.name} - ${c.detail}`);
  }
  const failed = suite.cases.filter((c) => c.status === "fail").length;
  console.log(`\n${suite.cases.length - failed}/${suite.cases.length} portfolio-figure-drift cases passed`);
  process.exit(failed === 0 ? 0 : 1);
}

if (process.argv[1] && process.argv[1].endsWith("portfolio-figure-drift.ts")) main();
