// Section 4 (feat/plain-summary): "What history says" in plain words.
//
// Reuses the analog engine's own output (FactorAnalogSet instances from
// src/lib/ai/factors.ts) and its own Wilson interval (analytics.ts); none of
// that math changes. This only turns it into words and dots.
//
// Run: npx tsx --conditions=react-server scripts/tests/history-plain.ts

import { pathToFileURL } from "node:url";
import { historyInPlainWords, plainConditions, tenthsWords } from "@/lib/ai/history-plain";
import { wilsonInterval } from "@/lib/ai/analytics";
import { writeReport, type SuiteResult, type TestCase } from "./report";

function instances(outcomes: number[]) {
  // outcomes: % move over the horizon, oldest first.
  return outcomes.map((m, i) => ({ date: new Date(Date.UTC(2023, 0, 2) + i * 14 * 86_400_000).toISOString().slice(0, 10), priceBefore: 100, priceAfter: 100 + m }));
}

export function runHistoryPlainSuite(): SuiteResult {
  const cases: TestCase[] = [];
  const check = (name: string, ok: boolean, detail: string) => cases.push({ name, status: ok ? "pass" : "fail", detail });

  // 14 cases, 9 higher: the brief's own example.
  const moves = [3, -2, 5, 1, -4, 2, 6, -1, 2, 3, -3, 4, 1, -2];
  const h = historyInPlainWords({
    name: "NVIDIA",
    assetType: "equity",
    horizonSessions: 10,
    instances: instances(moves),
    conditions: [{ key: "trend", state: "uptrend" }],
  });
  check("counts higher vs not higher", h.status === "ok" && h.n === 14 && h.higher === 9 && h.notHigher === 5, `${h.higher} of ${h.n}`);
  check(
    "headline: the brief's sentence, with 10 sessions said as two weeks",
    h.headline === "The last 14 times NVIDIA looked like this (a rising price trend), the share was higher two weeks later 9 times.",
    h.headline,
  );
  const w = wilsonInterval(9, 14);
  check(
    "the range is the engine's own Wilson interval, in tenths",
    h.rateLow === Math.round(w.low * 10) && h.rateHigh === Math.round(w.high * 10) && h.rateLow === 4 && h.rateHigh === 8,
    `Wilson ${w.low.toFixed(3)}-${w.high.toFixed(3)} -> ${h.rateLow} in 10 to ${h.rateHigh} in 10`,
  );
  check(
    "range sentence in words, as a pattern and not a promise",
    h.rangeSentence === "That is a past pattern, not a promise. With 14 cases, the true rate could be anywhere from about 4 in 10 to 8 in 10.",
    h.rangeSentence,
  );
  check("confidence uses the engine's rule (14 cases -> medium)", h.confidence === "medium" && h.confidenceSentence === "Confidence: medium.", h.confidenceSentence);
  check(
    "dots: one per case, oldest first, higher vs not higher (shape, not colour)",
    h.dots.length === 14 && h.dots.filter((d) => d === "higher").length === 9 && h.dots[0] === "higher" && h.dots[1] === "not_higher",
    h.dots.join(","),
  );
  check(
    "a case that ended exactly flat is not counted as higher",
    historyInPlainWords({ name: "X", assetType: "equity", horizonSessions: 10, instances: instances([0, 1, 1, 1, 1]) }).higher === 4,
    "0% move -> not higher",
  );

  const big = historyInPlainWords({ name: "SPY", assetType: "etf", horizonSessions: 10, instances: instances(Array.from({ length: 40 }, (_, i) => (i % 4 === 0 ? -1 : 1))) });
  check("40 cases with a tight range -> high confidence", big.confidence === "high", `${big.n} cases, ${big.rateLow}-${big.rateHigh} in 10, ${big.confidence}`);

  const coin = historyInPlainWords({ name: "Bitcoin", assetType: "crypto", horizonSessions: 10, instances: instances([2, -1, 3, 4, -2, 1]) });
  check(
    "crypto trades every day: 10 sessions are said as 10 days, and 'price' not 'share'",
    /the price was higher 10 days later 4 times\.$/.test(coin.headline),
    coin.headline,
  );

  const few = historyInPlainWords({ name: "RKLB", assetType: "equity", horizonSessions: 10, instances: instances([1, 2, -1, 3]) });
  check(
    "fewer than 5 cases: says so and gives no rate",
    few.status === "too_few" && few.headline === "RKLB has looked like this only 4 times before, too few to say what usually follows." && few.rangeSentence === "",
    few.headline,
  );
  const none = historyInPlainWords({ name: "NEWCO", assetType: "equity", horizonSessions: 10, instances: [] });
  check("no cases at all", none.status === "too_few" && /hasn't looked like this before/.test(none.headline), none.headline);

  check("tenths in words at the extremes", tenthsWords(0) === "almost never" && tenthsWords(10) === "almost always" && tenthsWords(3) === "about 3 in 10", `${tenthsWords(0)} / ${tenthsWords(10)}`);
  check(
    "matched conditions are named without jargon (no SMA, RSI, decile, standard deviations)",
    plainConditions([
      { key: "trend", state: "uptrend" },
      { key: "rsi14", state: "overbought" },
      { key: "volatility", state: "elevated" },
    ]) === "a rising price trend, a fast run-up and bigger swings than usual",
    plainConditions([{ key: "trend", state: "uptrend" }, { key: "rsi14", state: "overbought" }, { key: "volatility", state: "elevated" }]),
  );
  check(
    "every number in the words appears in the inputs",
    [h.headline, h.rangeSentence].join(" ").match(/\d+/g)!.every((n) => h.inputs.some((i) => i.display === n)),
    h.inputs.map((i) => `${i.label}=${i.display}`).join("; "),
  );

  return { suiteName: "What history says (plain words)", gating: true, cases };
}

function main() {
  const suite = runHistoryPlainSuite();
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
