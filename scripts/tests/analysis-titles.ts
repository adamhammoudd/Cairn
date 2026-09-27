// Every analysis gets its own headline (fix/analysis-unique-titles).
//
// On 2026-09-26 every stored analysis was `text_source = template` with
// text_failures [unexplained_jargon, watch_unsourced], so every ticker got the
// same headline shape. Replaying the four real rejected drafts showed why:
//   - watch_unsourced: the model named the PUBLISHER ("MarketWatch"), and the
//     check demanded the FEED name ("MarketWatch Top Stories");
//   - unexplained_jargon: "year over year" spelled out was on the jargon list.
// Both good drafts were thrown away; the two bad ones must stay rejected (one
// predicted "likely to stay higher", one credited a Yahoo headline to
// MarketWatch).
//
// Inputs are REAL: scripts/tests/fixtures/analysis-inputs.json was captured
// from the live database (scripts/capture-analysis-inputs.ts). The model is
// mocked: mockModelDraft() writes in the style the real model used on
// 2026-09-26 (publisher names in watch items, "year over year", figures copied
// from the inputs). The live rate needs a funded model key - see the PR.
//
// Run: npx tsx --conditions=react-server scripts/tests/analysis-titles.ts

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  checkAnalysisText,
  dayMonth,
  generateAnalysisText,
  historyWords,
  namesSource,
  publisherName,
  templateAnalysisText,
  type ModelAnalysisText,
  type TextInputs,
} from "@/lib/ai/analysis-text";
import { unexplainedJargon } from "@/lib/ai/plain-summary";
import { plainName } from "@/lib/ai/ticker-analysis";
import { plainDate } from "@/lib/scorecard";
import { writeReport, type SuiteResult, type TestCase } from "./report";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const INPUTS = JSON.parse(fs.readFileSync(path.join(DIR, "fixtures/analysis-inputs.json"), "utf8")).inputs as Record<string, TextInputs>;
const DRAFTS = JSON.parse(fs.readFileSync(path.join(DIR, "fixtures/analysis-drafts-2026-09-26.json"), "utf8")).drafts as {
  inputs: string;
  logged: string;
  draft: ModelAnalysisText;
}[];
export const TEN_TICKERS = ["NVDA", "MSFT", "AAPL", "AMZN", "TSLA", "GOOGL", "RKLB", "SMCI", "SPY", "BTC"];

function check(name: string, ok: boolean, detail: string): TestCase {
  return { name, status: ok ? "pass" : "fail", detail };
}

/** Name, numbers and dates masked: what is left is the sentence's shape. */
export function headlineShape(headline: string, name: string): string {
  return headline
    .split(name)
    .join("<NAME>")
    .replace(/\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2} [A-Z][a-z]{2}\b/g, "<DATE>")
    .replace(/[+\-−]?\d[\d,.]*%?/g, "<N>");
}

/**
 * A draft in the style the real model wrote on 2026-09-26: its own headline
 * from the trend and price verdicts, the history line and scorecard sentences
 * lightly reworded ("year over year"), and watch items naming the publisher.
 */
export function mockModelDraft(i: TextInputs): ModelAnalysisText {
  const d = (k: string) => i.scorecard.dimensions.find((x) => x.key === k);
  const noun = i.assetType === "crypto" || i.assetType === "etf" ? "price" : "share";
  const trend = d("trend")?.verdict;
  const moving = trend === "Rising" ? "has been rising lately" : trend === "Falling" ? "has been falling lately" : "has moved sideways lately";
  const val = d("valuation")?.verdict;
  const price = val === "Cheaper than usual" ? " and costs less than usual for its profit" : val === "Pricier than usual" ? " and costs more than usual for its profit" : "";
  const hw = historyWords(i.history, i.name, i.assetType, i.noHistoryReason, i.historyBasis)!;
  const growth = d("growth");
  const bullets = [
    [hw.line, hw.range].filter(Boolean).join(" "),
    growth && growth.level !== "not_applicable" ? growth.sentence.replace(/ on last year/, " year over year") : `There is no single company behind ${i.name}, so only its price record applies.`,
    d("trend")?.sentence ?? hw.confidence,
  ];
  const health = d("health");
  if (health && health.level !== "not_applicable") bullets.push(health.sentence);
  const watch: ModelAnalysisText["watch"] = [];
  const e = i.events[0];
  if (e) watch.push({ text: `Earnings expected around ${plainDate(e.date)}${e.estimated ? " (estimated)" : ""}.`, ref: e.id });
  const n = i.news.find((x) => !/\d/.test(x.title));
  if (n) watch.push({ text: `${n.title.replace(/[.!?]+$/, "")}, ${publisherName(n.source)}, ${dayMonth(n.date.slice(0, 10))}.`, ref: n.id });
  return { headline: `${i.name}'s ${noun} ${moving}${price}.`, bullets: bullets.slice(0, 4), watch, sources_used: n ? [n.id] : [] };
}

export async function runAnalysisTitlesSuite(): Promise<SuiteResult> {
  const cases: TestCase[] = [];

  // ---- the two causes, pinned ------------------------------------------------
  cases.push(check("publisherName: feed -> publisher", publisherName("MarketWatch Top Stories (RSS)") === "MarketWatch" && publisherName("Yahoo Finance News (RSS)") === "Yahoo Finance" && publisherName("Federal Reserve Press Releases (RSS)") === "Federal Reserve" && publisherName("SEC EDGAR") === "SEC EDGAR", publisherName("MarketWatch Top Stories (RSS)")));
  cases.push(check("a watch item naming the publisher names its source", namesSource("Stock rally noted by MarketWatch, 25 Sep.", "MarketWatch Top Stories"), "MarketWatch"));
  cases.push(check("the full feed name still counts", namesSource("see MarketWatch Top Stories, 25 Sep", "MarketWatch Top Stories (RSS)"), "feed"));
  cases.push(check("a different publisher does NOT count (misattribution stays caught)", !namesSource("..., MarketWatch, 23 Sep.", "Yahoo Finance News"), "MarketWatch vs Yahoo Finance"));
  cases.push(check("'year over year' spelled out is plain English now", unexplainedJargon("Sales up 83% and profit up 123% year over year.") === null, "null"));
  cases.push(check("'YoY' is still jargon", unexplainedJargon("Sales up 18% YoY.") === "YoY", String(unexplainedJargon("Sales up 18% YoY."))));
  cases.push(check("an unexplained P/E is still jargon", unexplainedJargon("It trades at a P/E of 28.") === "P/E", String(unexplainedJargon("It trades at a P/E of 28."))));
  cases.push(check("an explained P/E still passes", unexplainedJargon("It trades at a P/E (price compared with profit) of 28.") === null, "explained"));

  // ---- the four real drafts, against their real generation-time inputs --------
  const outcome = DRAFTS.map((d) => ({ ...d, check: checkAnalysisText(d.draft, INPUTS[d.inputs]) }));
  const [msftWatch, msftJargon, nvdaWatch, nvdaJargon] = outcome;
  cases.push(check("real MSFT draft (logged watch_unsourced) now passes", msftWatch.check.passed, JSON.stringify(msftWatch.check)));
  cases.push(check("real NVDA draft (logged unexplained_jargon) now passes", nvdaJargon.check.passed, JSON.stringify(nvdaJargon.check)));
  cases.push(check("real MSFT draft 'likely to stay higher' is STILL rejected - as a prediction", !msftJargon.check.passed && msftJargon.check.reason === "stated_as_fact", JSON.stringify(msftJargon.check)));
  cases.push(check("real NVDA draft crediting a Yahoo headline to MarketWatch is STILL rejected", !nvdaWatch.check.passed && nvdaWatch.check.reason === "watch_unsourced", JSON.stringify(nvdaWatch.check)));

  // ---- the prediction check got tighter, not looser -----------------------------
  const base = INPUTS.NVDA;
  const withHeadline = (headline: string) => checkAnalysisText({ ...templateAnalysisText(base), headline }, base, { minWatch: 0 });
  for (const h of ["NVIDIA's share is likely to stay higher.", "NVIDIA's share will rise.", "NVIDIA's share is expected to remain strong.", "NVIDIA's share is set to hold firm."]) {
    const r = withHeadline(h);
    cases.push(check(`prediction rejected: "${h}"`, !r.passed && r.reason === "stated_as_fact", JSON.stringify(r)));
  }
  for (const h of ["NVIDIA's share should be bought now.", "NVIDIA looks like a buy.", "This is a good time to add NVIDIA."]) {
    const r = withHeadline(h);
    cases.push(check(`advice still rejected: "${h}"`, !r.passed, JSON.stringify(r)));
  }

  // ---- 10 tickers: template headlines --------------------------------------------
  const templates = TEN_TICKERS.map((s) => ({ s, i: INPUTS[s], t: templateAnalysisText(INPUTS[s]) }));
  const heads = templates.map((x) => x.t.headline);
  cases.push(check("10 tickers: no two template headlines are the same", new Set(heads).size === 10, heads.join(" | ")));
  const shapes = templates.map((x) => headlineShape(x.t.headline, x.i.name));
  const shapeCounts = new Map<string, number>();
  for (const sh of shapes) shapeCounts.set(sh, (shapeCounts.get(sh) ?? 0) + 1);
  cases.push(check("10 tickers: at least 7 different sentence shapes (was 1 shape for every company)", shapeCounts.size >= 7, `${shapeCounts.size} shapes: ${[...shapeCounts.keys()].join(" | ")}`));
  cases.push(check("10 tickers: no shape used more than twice", Math.max(...shapeCounts.values()) <= 2, JSON.stringify([...shapeCounts])));
  for (const x of templates) {
    const r = checkAnalysisText(x.t, x.i, { minWatch: 0 });
    cases.push(check(`${x.s}: template passes every check - "${x.t.headline}"`, r.passed, JSON.stringify(r)));
  }
  const tsla = templates.find((x) => x.s === "TSLA")!.t.headline;
  cases.push(check("results 4 days away lead the headline (TSLA)", /^TSLA reports results around/.test(tsla), tsla));
  const smci = templates.find((x) => x.s === "SMCI")!.t.headline;
  cases.push(check("a 95% six-month move leads the headline (SMCI)", /up 95% over 6 months/.test(smci), smci));
  cases.push(check("a missing directory name reads as the symbol, not 'Tsla'", plainName("TSLA", "TSLA", "equity") === "TSLA" && plainName("NVIDIA Corporation", "NVDA", "equity") === "NVIDIA" && plainName("COCA COLA CO", "KO", "equity") === "Coca Cola", plainName("TSLA", "TSLA", "equity")));

  // ---- 10 tickers: mocked model, real inputs, real guards ---------------------------
  let modelPassed = 0;
  const generated: string[] = [];
  for (const s of TEN_TICKERS) {
    const i = INPUTS[s];
    const g = await generateAnalysisText(i, {
      complete: async () => mockModelDraft(i),
      classify: async () => ({ status: "clear" as const }),
      mode: "strict",
    });
    if (g.source === "model") modelPassed++;
    generated.push(g.text.headline);
    if (g.source !== "model") cases.push(check(`${s}: mocked model draft rejected`, true, `${g.attempts.map((a) => `${a.reason}: ${a.evidence ?? ""}`).join(" / ")}`));
  }
  cases.push(check("≥8 of 10 model-style drafts pass the guards against real inputs", modelPassed >= 8, `${modelPassed}/10`));
  cases.push(check("10 generated headlines (model or template) are all different", new Set(generated).size === 10, generated.join(" | ")));

  return { suiteName: "Analysis titles (every ticker its own headline; guards reject advice, not plain text)", gating: true, cases };
}

async function main() {
  const suite = await runAnalysisTitlesSuite();
  console.log(`Report written to ${writeReport([suite])}`);
  const failed = suite.cases.filter((c) => c.status === "fail");
  for (const c of failed) console.log(`FAIL: ${c.name} - ${c.detail}`);
  console.log(`${suite.cases.length - failed.length}/${suite.cases.length} passed.`);
  if (failed.length > 0) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
