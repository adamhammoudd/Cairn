// Section 5 (feat/analysis-summary-layout): "What this means for you".
//
// Code-computed, factual arithmetic about the reader's own exposure - never
// written by the model, never an evaluation or a suggestion. Built behind
// ENABLE_EXPOSURE_FIGURES (off by default) pending Adam's decision on the
// CLAUDE.md wording. These cases pin the arithmetic and prove every line
// passes the same scope guard as everything else.
//
// Run: npx tsx --conditions=react-server scripts/tests/exposure.ts

import { pathToFileURL } from "node:url";
import { exposureFacts, exposureLines, roughMoney, isExposureEnabled } from "@/lib/exposure";
import { checkScopeGuard } from "@/lib/ai/scope-guard";
import { writeReport, type SuiteResult, type TestCase } from "./report";

// The caller rounds in the DISPLAY currency (two significant figures), as the page does.
const eur = (usd: number) => `€${roughMoney(usd * 0.9).toLocaleString("en-US")}`;

export function runExposureSuite(): SuiteResult {
  const cases: TestCase[] = [];
  const check = (name: string, ok: boolean, detail: string) => cases.push({ name, status: ok ? "pass" : "fail", detail });

  const holdings = [
    { symbol: "NVDA", value: 3390 },
    { symbol: "MSFT", value: 3000 },
    { symbol: "AMZN", value: 2400 },
    { symbol: "ISRG", value: 2300 },
    { symbol: "BTC", value: 2470 },
  ];
  const f = exposureFacts({ symbol: "NVDA", holdings, medianEarningsMove: 0.068, weakenedThisWeek: [] });
  check("share of portfolio", f !== null && Math.round(f.share * 100) === 25 && f.isLargest, `${f && (f.share * 100).toFixed(1)}% largest=${f?.isLargest}`);
  check("typical results-day swing in money = median absolute move x position value", f !== null && Math.abs(f.earningsSwing! - 0.068 * 3390) < 1e-9, `${f?.earningsSwing}`);

  const lines = exposureLines("NVIDIA", f!, eur);
  check(
    "lines read as facts",
    lines[0] === "NVIDIA is 25% of your portfolio, the biggest part of it." &&
      lines[1] === "On a typical results day it has moved 6.8%, roughly €210 either way on this holding." &&
      lines[2] === "Nothing in the company's numbers weakened this week.",
    lines.join(" | "),
  );
  check("every line passes the scope guard (no advice, no evaluation)", lines.every((l) => checkScopeGuard(l).passed), lines.map((l) => checkScopeGuard(l).reason ?? "ok").join(", "));
  check("no line tells the reader what to do", lines.every((l) => !/\b(should|consider|may want|could|time to)\b/i.test(l)), "checked modal/advice words");

  const small = exposureFacts({ symbol: "ISRG", holdings: [...holdings, { symbol: "SPY", value: 200000 }], medianEarningsMove: null, weakenedThisWeek: null })!;
  const smallLines = exposureLines("Intuitive Surgical", small, eur);
  check(
    "under 1% says so; no earnings history and no week-ago scorecard -> those lines are left out",
    smallLines.length === 1 && smallLines[0] === "Intuitive Surgical is about 1% of your portfolio.",
    smallLines.join(" | "),
  );
  const weakened = exposureLines("Amazon", exposureFacts({ symbol: "AMZN", holdings, medianEarningsMove: null, weakenedThisWeek: ["Financial health"] })!, eur);
  check("a weakened dimension is not hidden behind 'nothing weakened'", !weakened.some((l) => /Nothing .* weakened/.test(l)), weakened.join(" | "));
  check("not held -> no box", exposureFacts({ symbol: "TSLA", holdings, medianEarningsMove: 0.05, weakenedThisWeek: [] }) === null, "null");
  check("unpriced portfolio -> no box rather than a guess", exposureFacts({ symbol: "NVDA", holdings: [{ symbol: "NVDA", value: null }], medianEarningsMove: 0.05, weakenedThisWeek: [] }) === null, "null");
  check("rough money: two significant figures", roughMoney(230.52) === 230 && roughMoney(1834) === 1800 && roughMoney(7.4) === 7.4, `${roughMoney(230.52)} ${roughMoney(1834)} ${roughMoney(7.4)}`);
  check("off unless ENABLE_EXPOSURE_FIGURES is exactly 'true'", !isExposureEnabled(undefined) && !isExposureEnabled("1") && isExposureEnabled("true"), "flag");

  return { suiteName: "What this means for you (factual exposure, flagged)", gating: true, cases };
}

function main() {
  const suite = runExposureSuite();
  const reportPath = writeReport([suite]);
  console.log(`Report written to ${reportPath}`);
  const failed = suite.cases.filter((c) => c.status === "fail");
  for (const c of suite.cases) console.log(`${c.status === "pass" ? "PASS" : "FAIL"}: ${c.name} - ${c.detail}`);
  console.log(`${suite.cases.length - failed.length}/${suite.cases.length} passed.`);
  if (failed.length > 0) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
