// Section 3 (feat/plain-summary): the model-written plain summary and the
// server-side guards that decide whether a user ever sees it.
//
// The model gets only the scorecard, the history result and upcoming events,
// and writes a headline plus 3-4 bullets. Every guard fails CLOSED: on any
// failure the user sees a template built from the scorecard's own sentences,
// never the model's text. The model call is injected here, so these cases run
// with no model and no network.
//
// Run: npx tsx --conditions=react-server scripts/tests/plain-summary.ts

import { pathToFileURL } from "node:url";
import {
  allowedNumbersFor,
  checkSummaryText,
  extractNumbers,
  generatePlainSummary,
  templateSummary,
  type SummaryInputs,
} from "@/lib/ai/plain-summary";
import { historyInPlainWords } from "@/lib/ai/history-plain";
import { snapshotCards } from "./scorecard";
import { writeReport, type SuiteResult, type TestCase } from "./report";

function nvdaLike(): SummaryInputs {
  const cards = snapshotCards();
  const moves = [3, -2, 5, 1, -4, 2, 6, -1, 2, 3, -3, 4, 1, -2];
  const history = historyInPlainWords({
    name: "NVIDIA",
    assetType: "equity",
    horizonSessions: 10,
    instances: moves.map((m, i) => ({ date: new Date(Date.UTC(2023, 0, 2) + i * 14 * 86_400_000).toISOString().slice(0, 10), priceBefore: 100, priceAfter: 100 + m })),
    conditions: [{ key: "trend", state: "uptrend" }],
  });
  return { name: "NVIDIA", symbol: "GROW", assetType: "equity", scorecard: cards.GROW, history };
}

function coinInputs(): SummaryInputs {
  const cards = snapshotCards();
  return { name: "Bitcoin", symbol: "BTC", assetType: "crypto", scorecard: cards.BTC, history: null };
}

export async function runPlainSummarySuite(): Promise<SuiteResult> {
  const cases: TestCase[] = [];
  const check = (name: string, ok: boolean, detail: string) => cases.push({ name, status: ok ? "pass" : "fail", detail });
  const inputs = nvdaLike();
  const good = {
    headline: "A strong, fast-growing company whose share is priced high for its profit.",
    bullets: [
      "Sales are up 56% on last year, and profit is up 61%.",
      "The share costs 45 times the company's yearly profit; its 5-year average is 38.",
      "Up 34% over 6 months.",
      "Earnings come in 5 days, on Wed 1 Oct.",
    ],
  };

  // ---- the number guard -----------------------------------------------------
  const allowed = allowedNumbersFor(inputs);
  check("numbers in the inputs are allowed (56%, 45, 38, 9, 14)", ["56%", "45", "38", "9", "14"].every((n) => allowed.has(n)), [...allowed].slice(0, 30).join(" "));
  check("extracts digits, percentages, decimals and number words", JSON.stringify(extractNumbers("Up 34% in six months, 2.6 years, $1,200 and 0.02%.")) === JSON.stringify(["34%", "6", "2.6", "1200", "0.02%"]), JSON.stringify(extractNumbers("Up 34% in six months, 2.6 years, $1,200 and 0.02%.")));

  const pass = checkSummaryText(good, inputs);
  check("a faithful summary passes every guard", pass.passed, pass.reason ?? "passed");

  const table: [string, { headline: string; bullets: string[] }, string][] = [
    ["invented number", { ...good, bullets: [...good.bullets.slice(0, 3), "Analysts expect 70% more sales next year."] }, "number_not_in_inputs"],
    ["rounded number (56% -> about 60%)", { ...good, bullets: ["Sales are up about 60% on last year.", ...good.bullets.slice(1)] }, "number_not_in_inputs"],
    ["spelled-out number not in the inputs", { ...good, bullets: [...good.bullets.slice(0, 3), "It has beaten forecasts seven times in a row."] }, "number_not_in_inputs"],
    ["advice: good time to buy", { ...good, bullets: [...good.bullets.slice(0, 3), "It may be a good time to buy."] }, "scope_guard"],
    ["advice: consider selling", { ...good, headline: "Strong company; consider selling some shares after the run." }, "scope_guard"],
    ["advice: take profits", { ...good, bullets: [...good.bullets.slice(0, 3), "Take profits while the share is high."] }, "scope_guard"],
    ["freelanced probability", { ...good, bullets: [...good.bullets.slice(0, 3), "There is a 64% chance it rises after earnings."] }, "freelanced_probability"],
    ["jargon-only sentence", { ...good, bullets: [...good.bullets.slice(0, 3), "The EBITDA margin is strong."] }, "unexplained_jargon"],
    ["jargon-only: P/E", { ...good, bullets: [...good.bullets.slice(0, 3), "Its P/E of 45 is above average."] }, "unexplained_jargon"],
    ["sentence too long", { ...good, bullets: [...good.bullets.slice(0, 3), "Sales are up 56% on last year and profit is up 61% and the price has been climbing for 6 months which is a long time for any share to keep going up."] }, "sentence_too_long"],
    ["too few bullets", { ...good, bullets: good.bullets.slice(0, 2) }, "structure"],
    ["too many bullets", { ...good, bullets: [...good.bullets, "Up 34% over 6 months."] }, "structure"],
    ["empty headline", { ...good, headline: "" }, "structure"],
    ["talks to the reader about their position", { ...good, bullets: [...good.bullets.slice(0, 3), "Your position is heavily concentrated in it."] }, "addresses_reader"],
    ["addresses the reader at all", { ...good, headline: "You own a strong, fast-growing company." }, "addresses_reader"],
  ];
  for (const [name, text, reason] of table) {
    const r = checkSummaryText(text, inputs);
    check(`flags: ${name}`, !r.passed && r.reason === reason, `${r.reason ?? "passed"}${r.evidence ? ` - "${r.evidence}"` : ""}`);
  }
  const explained = checkSummaryText(
    { ...good, bullets: [...good.bullets.slice(0, 3), "Keeps 52 cents of every dollar of sales as EBITDA (profit before interest, tax and write-downs)."] },
    inputs,
  );
  check("jargon explained right where it is used is allowed", explained.passed, explained.reason ?? "passed");

  // ---- the template ------------------------------------------------------------
  const t = templateSummary(inputs);
  check(
    "template headline is built from the verdicts",
    t.headline === "A strong, growing company whose share is priced high for its profit. Earnings are due in 5 days.",
    t.headline,
  );
  check("template bullets are the scorecard's own sentences", t.bullets.length >= 3 && t.bullets.length <= 4 && t.bullets[0].startsWith("Sales are up 56% on last year"), t.bullets.join(" | "));
  const tCheck = checkSummaryText(t, inputs);
  check("the template itself passes every guard", tCheck.passed, tCheck.reason ?? "passed");

  const payer: SummaryInputs = { name: "Coca-Cola", symbol: "PAYR", assetType: "equity", scorecard: snapshotCards().PAYR, history: null };
  const payerTemplate = await generatePlainSummary(payer, async () => null);
  check(
    "a dividend payer's template survives its own guard (a term explained once may repeat in that bullet)",
    payerTemplate.source === "template" && payerTemplate.bullets.length === 4 && payerTemplate.bullets.some((b) => /2\.6 years of EBITDA/.test(b)),
    `${payerTemplate.headline} | ${payerTemplate.bullets.length} bullets`,
  );
  check(
    "a term used again in a DIFFERENT bullet still needs its own explanation",
    checkSummaryText({ ...good, bullets: [...good.bullets.slice(0, 3), "Its debt is small next to its EBITDA."] }, inputs).reason === "unexplained_jargon",
    "second bullet repeats EBITDA without brackets",
  );

  const coin = templateSummary(coinInputs());
  const coinCheck = checkSummaryText(coin, coinInputs(), { minBullets: 1 });
  check(
    "crypto template: no company, only the price record",
    coin.headline === "Bitcoin has no company behind it, so only its price record applies." && coin.bullets[0].startsWith("Down 9% over 6 months") && coinCheck.passed,
    `${coin.headline} | ${coin.bullets.join(" | ")} | ${coinCheck.reason ?? "passes guards"}`,
  );

  check(
    "an empty calendar is not turned into a summary bullet",
    coin.bullets.every((b) => !/calendar/i.test(b)) && !/calendar/i.test(coin.headline),
    coin.bullets.join(" | "),
  );

  // ---- generation fails closed ----------------------------------------------
  const ok = await generatePlainSummary(inputs, async () => good);
  check("a clean model answer is shown", ok.source === "model" && ok.failure === null && ok.headline === good.headline, `${ok.source} ${ok.failure ?? ""}`);

  const invented = await generatePlainSummary(inputs, async () => ({ ...good, bullets: [...good.bullets.slice(0, 3), "Sales should reach 90% growth."] }));
  check(
    "an invented number falls back to the template and records why",
    invented.source === "template" && invented.failure === "number_not_in_inputs" && invented.headline === t.headline,
    `${invented.source} ${invented.failure} ${invented.evidence ?? ""}`,
  );
  const advice = await generatePlainSummary(inputs, async () => ({ ...good, headline: "A good time to buy a strong company." }));
  check("advice falls back to the template", advice.source === "template" && advice.failure === "scope_guard", `${advice.source} ${advice.failure}`);
  const threw = await generatePlainSummary(inputs, async () => {
    throw new Error("rate limited");
  });
  check("a model error falls back to the template", threw.source === "template" && threw.failure === "model_error", `${threw.source} ${threw.failure}`);
  const junk = await generatePlainSummary(inputs, async () => null);
  check("an unusable model answer falls back to the template", junk.source === "template" && junk.failure === "model_unusable", `${junk.source} ${junk.failure}`);

  return { suiteName: "Plain summary (guards fail closed to a template)", gating: true, cases };
}

async function main() {
  const suite = await runPlainSummarySuite();
  const reportPath = writeReport([suite]);
  console.log(`Report written to ${reportPath}`);
  const failed = suite.cases.filter((c) => c.status === "fail");
  for (const c of suite.cases) console.log(`${c.status === "pass" ? "PASS" : "FAIL"}: ${c.name} - ${c.detail}`);
  console.log(`${suite.cases.length - failed.length}/${suite.cases.length} passed.`);
  if (failed.length > 0) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
