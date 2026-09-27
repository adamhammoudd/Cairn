// Honest failure messages (fix/analysis-failure-reasons).
//
// "Generate analysis" for Micron read "Not enough historical data available
// for this scope yet" while Micron had five years of daily prices on file: the
// real reason was that no news item was tagged MU, and the action mapped three
// different failures to one sentence about history, logging none of them.
//
// 1. Each reason generate.ts can stop on is found by findDataGaps, from the
//    same inputs generate.ts has - MU's shape (analogs, no news) is no_news,
//    never a history reason.
// 2. Each reason has its own plain sentence and title.
// 3. The action maps a typed AnalysisDataGap, not message substrings, and logs
//    the reasons on every unavailable outcome.
// 4. The Research/chat panel shows the specific reason.
//
// Pure: no network, no database.
//
// Run: npx tsx --conditions=react-server scripts/tests/analysis-failure-reasons.ts

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { AnalysisDataGap, explainGaps, findDataGaps, gapSentence, type DataGap, type GapInputs } from "@/lib/analysis-gaps";
import { MIN_FACTOR_ANALOG_SAMPLE } from "@/lib/ai/factors";
import { UNAVAILABLE_MESSAGE } from "@/lib/analysis";
import { plainName } from "@/lib/ai/ticker-analysis";
import { renderComponentText } from "./render-helper";
import { writeReport, type SuiteResult, type TestCase } from "./report";

function check(name: string, ok: boolean, detail: string): TestCase {
  return { name, status: ok ? "pass" : "fail", detail };
}

const base: GapInputs = { scopeType: "ticker", analogCount: 0, sourceCount: 0, factor: null, minSample: MIN_FACTOR_ANALOG_SAMPLE };
const reasons = (g: DataGap[]) => g.map((x) => x.reason).join(",");

export async function runAnalysisFailureReasonsSuite(): Promise<SuiteResult> {
  const cases: TestCase[] = [];

  // --- 1. findDataGaps: the reason, from the inputs generate.ts has.
  const mu = findDataGaps({ ...base, analogCount: 33, sourceCount: 0, factor: { ok: true } });
  cases.push(check("MU shape (33 factor analogs, 0 tagged news) -> no_news only", reasons(mu) === "no_news", reasons(mu)));

  const amd = findDataGaps({ ...base, analogCount: 0, sourceCount: 25, factor: { ok: false, reason: "insufficient_instances", bestSampleSize: 3 } });
  cases.push(check("too few factor matches, news present -> unusual_setup with the match count", reasons(amd) === "unusual_setup" && amd[0].matches === 3 && amd[0].needed === MIN_FACTOR_ANALOG_SAMPLE, JSON.stringify(amd)));

  const ordinary = findDataGaps({ ...base, analogCount: 0, sourceCount: 25, factor: { ok: false, reason: "no_active_conditions", bestSampleSize: 0 } });
  cases.push(check("ordinary day, no curated cases -> ordinary_no_record", reasons(ordinary) === "ordinary_no_record", reasons(ordinary)));

  const young = findDataGaps({ ...base, sourceCount: 4, factor: null, bars: 4 });
  cases.push(check("4 stored bars -> short_history with the bar count", reasons(young) === "short_history" && young[0].bars === 4, JSON.stringify(young)));

  const none = findDataGaps({ ...base, sourceCount: 0, factor: null, bars: 0 });
  cases.push(check("no bars and no news -> no_price_history then no_news", reasons(none) === "no_price_history,no_news", reasons(none)));

  const both = findDataGaps({ ...base, analogCount: 0, sourceCount: 0, factor: { ok: false, reason: "insufficient_instances", bestSampleSize: 2 } });
  cases.push(check("both missing -> history reason first, then no_news", reasons(both) === "unusual_setup,no_news", reasons(both)));

  const fine = findDataGaps({ ...base, analogCount: 12, sourceCount: 3, factor: { ok: true } });
  cases.push(check("analogs and sources present -> no gap", fine.length === 0, reasons(fine)));

  const sector = findDataGaps({ ...base, scopeType: "sector", analogCount: 0, sourceCount: 0 });
  cases.push(check("sector with nothing -> one no_record (not also no_news)", reasons(sector) === "no_record", reasons(sector)));
  const sectorNews = findDataGaps({ ...base, scopeType: "sector", analogCount: 0, sourceCount: 5 });
  cases.push(check("sector with news, no events -> no_past_events", reasons(sectorNews) === "no_past_events", reasons(sectorNews)));

  // --- 2. Each reason -> its own sentence.
  const expect: [DataGap, string, string | null, string][] = [
    [{ reason: "no_news" }, "Micron", "equity", "No recent news mentions Micron, so there's nothing to cite yet."],
    [{ reason: "unusual_setup", matches: 3, needed: 5 }, "AMD", "equity", "Today's setup for AMD is unusual: it matched only 3 past moments, too few to measure."],
    [{ reason: "unusual_setup", matches: 1, needed: 5 }, "AMD", "equity", "Today's setup for AMD is unusual: it matched only 1 past moment, too few to measure."],
    [{ reason: "unusual_setup", matches: 0, needed: 5 }, "AMD", "equity", "Today's setup for AMD is unusual: it matched no past moments, too few to measure."],
    [{ reason: "short_history", bars: 4 }, "BLORB", "equity", "BLORB has only 4 trading days of price history, too new to compare with its own past."],
    [{ reason: "short_history", bars: 90 }, "Pepe", "crypto", "Pepe has only 90 days of price history, too new to compare with its own past."],
    [{ reason: "ordinary_no_record" }, "Kratos", "equity", "Nothing about Kratos's price is unusual today, and there are no past cases on file to compare it with yet."],
    [{ reason: "no_price_history", bars: 0 }, "Intel", "equity", "Intel has no stored price history yet, so there is nothing to compare with its own past."],
    [{ reason: "no_record" }, "semiconductors", null, "There's no news or past-event record for semiconductors yet."],
    [{ reason: "no_past_events" }, "semiconductors", null, "There are no past events on record for semiconductors to measure against yet."],
  ];
  for (const [gap, name, type, want] of expect) {
    const got = gapSentence(gap, name, type);
    cases.push(check(`${gap.reason} (${name}) reads as its own reason`, got === want, got));
  }
  for (const [gap, name, type] of expect) {
    const got = gapSentence(gap, name, type);
    cases.push(check(`${gap.reason}: never the generic "historical data" wording`, !/not enough historical data/i.test(got) && got !== UNAVAILABLE_MESSAGE, got));
  }

  const explained = explainGaps(both, "AMD", "equity");
  cases.push(
    check(
      "two reasons -> both sentences, titled by the first",
      explained.title === "Today's setup is unusual" && explained.message.includes("matched only 2 past moments") && explained.message.includes("No recent news mentions AMD"),
      JSON.stringify(explained),
    ),
  );

  const err = new AnalysisDataGap("MU", mu, { name: "Micron Technology, Inc.", assetType: "equity" });
  cases.push(check("AnalysisDataGap carries reasons, name and type, and logs them in its message", err.gaps === mu && err.displayName === "Micron Technology, Inc." && /no_news/.test(err.message), err.message));

  // --- 3. The pipeline (what the action runs after the quota gate): typed
  // mapping, logged, no substring matching left in either file.
  const action = fs.readFileSync(path.resolve("src/lib/ai/analysis-pipeline.ts"), "utf8") + fs.readFileSync(path.resolve("src/lib/actions/analysis.ts"), "utf8");
  cases.push(check("action maps `instanceof AnalysisDataGap`", /err instanceof AnalysisDataGap/.test(action), "src/lib/ai/analysis-pipeline.ts"));
  cases.push(check("action logs every unavailable outcome with its reasons", /console\.warn\("\[analysis\] unavailable", \{[^}]*reasons/.test(action), "console.warn([analysis] unavailable, { reasons })"));
  cases.push(check("no message-substring mapping left (isThinDataFailure removed)", !/isThinDataFailure|message\.includes\(/.test(action), "no isThinDataFailure / message.includes"));
  const generate = fs.readFileSync(path.resolve("src/lib/ai/generate.ts"), "utf8");
  cases.push(check("generate.ts throws AnalysisDataGap from findDataGaps, not bare thin-data Errors", /findDataGaps\(/.test(generate) && /new AnalysisDataGap\(/.test(generate) && !/must cite at least one source/.test(generate), "src/lib/ai/generate.ts"));

  // A coin's Yahoo name is its quote pair; the sentence names the coin.
  const inj = gapSentence({ reason: "no_news" }, plainName("Injective USD", "INJ", "crypto"), "crypto");
  cases.push(check('"Injective USD" reads as "Injective"', inj === "No recent news mentions Injective, so there's nothing to cite yet.", inj));

  // --- 4. What the panel shows.
  const panel = renderComponentText("src/components/analysis/research-states.tsx", "UnavailablePanel", { gap: explainGaps(mu, "Micron", "equity") });
  cases.push(check("panel shows the no-news reason and title", panel.includes("No recent news to cite") && panel.includes("No recent news mentions Micron") && !panel.includes(UNAVAILABLE_MESSAGE), panel.slice(0, 300)));
  const generic = renderComponentText("src/components/analysis/research-states.tsx", "UnavailablePanel", {});
  cases.push(check("panel without a reason keeps the generic wording", generic.includes(UNAVAILABLE_MESSAGE.slice(0, 40)), generic.slice(0, 200)));

  return { suiteName: "Analysis failure reasons", gating: true, cases };
}

async function main() {
  const suite = await runAnalysisFailureReasonsSuite();
  for (const c of suite.cases) console.log(`${c.status === "pass" ? "PASS" : "FAIL"}  ${c.name}${c.status === "pass" ? "" : `\n      ${c.detail}`}`);
  console.log(`Report written to ${writeReport([suite])}`);
  if (suite.cases.some((c) => c.status === "fail")) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) void main();
