// Section 2 (feat/analysis-generation-v2): what the model writes, and the
// server-side guards it must pass before anything is stored.
//
// The model writes a headline, 3-4 bullets, 1-3 things to watch and the ids of
// the news it relied on. Every number in its text must be one of the computed
// figures (sign included), no advice or imperatives, no predictions stated as
// fact, jargon explained on first use, every watch item tied to a dated event
// or a cited source. On any failure it gets one retry; a second failure stores
// Cairn's code template instead. Unchecked text is never stored.
//
// Run: npx tsx --conditions=react-server scripts/tests/analysis-text.ts

import { pathToFileURL } from "node:url";
import { directionalHistory } from "@/lib/ai/direction";
import {
  ANALYSIS_SYSTEM_PROMPT,
  analysisClassifierMode,
  buildComputedFigures,
  checkAnalysisText,
  extractSignedNumbers,
  generateAnalysisText,
  historyWords,
  templateAnalysisText,
  type ModelAnalysisText,
  type TextInputs,
} from "@/lib/ai/analysis-text";
import type { Scorecard } from "@/lib/scorecard";
import { directionColumns, matchedOnWords, plainName, plainSource, textInputsFor } from "@/lib/ai/ticker-analysis";
import { writeReport, type SuiteResult, type TestCase } from "./report";

function cases(moves: number[]) {
  return moves.map((m, i) => ({ date: new Date(Date.UTC(2023, 0, 2) + i * 14 * 86_400_000).toISOString().slice(0, 10), priceBefore: 100, priceAfter: 100 + m }));
}

const dim = (key: string, label: string, level: string, verdict: string, sentence: string, displays: string[] = []) => ({
  key,
  label,
  level,
  rated: key !== "next_event",
  verdict,
  sentence,
  inputs: displays.map((d, i) => ({ label: `in${i}`, value: null, display: d })),
  sources: [],
});

const stockCard = {
  symbol: "NVDA",
  asOf: "2026-09-25",
  dimensions: [
    dim("valuation", "Price vs profit", "strong", "Cheaper than usual", "The share costs 45 times the company's yearly profit, lower than its own 5-year average of 61.", ["45", "61"]),
    dim("growth", "Growth", "strong", "Strong", "Sales grew 56% over the last year.", ["56%"]),
    dim("health", "Financial health", "strong", "Strong", "It has more cash than debt.", []),
    dim("dividend", "Dividend", "not_applicable", "Tiny", "Pays 0.02% a year, too small to matter.", ["0.02%"]),
    dim("trend", "Price trend", "strong", "Rising", "Up 24% over 6 months, and 12% above its average price of the last 200 trading days.", ["24%", "12%"]),
    dim("next_event", "Next event", "not_applicable", "Earnings in about 53 days (estimated)", "Earnings, around Wed 18 Nov. This is an estimate from last year's results date, not a date the company has announced.", ["53", "Wed 18 Nov"]),
  ],
} as unknown as Scorecard;

// 14 cases, 9 higher; typical -1.8 / +1.5 / +3; worst -4, best +6.
const history = directionalHistory(cases([3, -2, 5, 1, -4, 2, 6, -1, 2, 3, -3, 4, 1, -2]), 10);

const inputs: TextInputs = {
  name: "NVIDIA",
  symbol: "NVDA",
  assetType: "equity",
  history,
  noHistoryReason: null,
  scorecard: stockCard,
  events: [{ id: "E1", rowId: "11111111-1111-1111-1111-111111111111", kind: "earnings", date: "2026-11-18", estimated: true }],
  news: [
    { id: "N1", rowId: "22222222-2222-2222-2222-222222222222", title: "Chip export rules tighten again", source: "Reuters", date: "2026-09-24" },
    { id: "N2", rowId: "33333333-3333-3333-3333-333333333333", title: "Nvidia shares jump 7% on data-centre demand", source: "CNBC", date: "2026-09-23" },
  ],
  trader: { moveBandLow: 9, moveBandHigh: 40, moveBandPoint: 21, hitCount: 3, sampleCount: 14, readings: [{ label: "RSI-14", display: "71.2" }] },
};

const good: ModelAnalysisText = {
  headline: "NVIDIA is a strong, growing company whose share costs less than usual for its profit.",
  bullets: [
    "Sales grew 56% over the last year, and it has more cash than debt.",
    "The share costs 45 times its yearly profit, below its own 5-year average of 61.",
    "The price is up 24% over 6 months.",
    "In similar moments before, it was higher 2 weeks later in 9 of 14 cases, usually between −2% and +3%.",
  ],
  watch: [
    { text: "Results expected around Wed 18 Nov (estimated).", ref: "E1" },
    { text: "Chip export rules, see Reuters, 24 Sep.", ref: "N1" },
  ],
  sources_used: ["N1"],
};

export async function runAnalysisTextSuite(): Promise<SuiteResult> {
  const out: TestCase[] = [];
  const check = (name: string, ok: boolean, detail: string) => out.push({ name, status: ok ? "pass" : "fail", detail });
  const flags = (name: string, t: ModelAnalysisText, reason: string) => {
    const r = checkAnalysisText(t, inputs);
    check(name, !r.passed && r.reason === reason, `${r.reason ?? "passed"}${r.evidence ? `: ${r.evidence}` : ""}`);
  };
  const withBullet = (i: number, b: string): ModelAnalysisText => ({ ...good, bullets: good.bullets.map((x, j) => (j === i ? b : x)) });

  // ------------------------------------------------------ history in words
  const hw = historyWords(history, "NVIDIA", "equity", null)!;
  check("history line: 'Higher 2 weeks later in 9 of 14 similar moments.'", hw.line === "Higher 2 weeks later in 9 of 14 similar moments.", hw.line);
  check("typical range in whole percent, signed", hw.range === "Usually between −2% and +3%, with the middle case +2%.", String(hw.range));
  check("worst and best in words", hw.extremes === "The worst case was −4% and the best +6%.", String(hw.extremes));
  check("confidence in words with the case count", hw.confidence === "Confidence: medium, from only 14 cases.", hw.confidence);
  check("history is framed as what happened before, not a forecast", /not a forecast/.test(hw.caveat), hw.caveat);
  const coinHw = historyWords(directionalHistory(cases([1, 2, -1, 3, 4, -2]), 10), "Bitcoin", "crypto", null)!;
  check("a coin trades daily: '10 days later'", coinHw.line === "Higher 10 days later in 4 of 6 similar moments.", coinHw.line);
  const noState = historyWords(null, "NVIDIA", "equity", "no_active_conditions")!;
  check("no unusual state today: says so plainly, no invented count", /isn't in an unusual price state/.test(noState.line) && noState.range === null && !/\d/.test(noState.line), noState.line);

  // ------------------------------------------------------ the figures block
  const block = buildComputedFigures(inputs);
  const order = ["WHAT HISTORY SAYS", "SCORECARD", "UPCOMING EVENTS", "RECENT HEADLINES", "TRADER FIGURES"].map((h) => block.indexOf(h));
  check("inputs in the brief's order: history, scorecard, events, headlines, trader figures last", order.every((v, i) => v >= 0 && (i === 0 || v > order[i - 1])), order.join(","));
  check("trader figures are marked context-only (the >=5% band never reaches the text)", /do not quote/i.test(block.slice(block.indexOf("TRADER FIGURES"))), "context-only");
  check("system prompt: direction and typical range first, never 'elevated move', no advice", /direction/i.test(ANALYSIS_SYSTEM_PROMPT) && /never.*elevated move/i.test(ANALYSIS_SYSTEM_PROMPT) && /consider/.test(ANALYSIS_SYSTEM_PROMPT) && /will rise/.test(ANALYSIS_SYSTEM_PROMPT), "prompt rules present");

  // ------------------------------------------------------------ must pass
  const ok = checkAnalysisText(good, inputs);
  check("must pass: a plain, sourced, number-true text", ok.passed, `${ok.reason ?? "passed"} ${ok.evidence ?? ""}`);
  check(
    "sign-aware number extraction ('−2%' and '-2%' are the same; '+3%' keeps its sign)",
    JSON.stringify(extractSignedNumbers("between −2% and -2% or +3%")) === JSON.stringify(["-2%", "-2%", "+3%"]),
    JSON.stringify(extractSignedNumbers("between −2% and -2% or +3%")),
  );

  // ------------------------------------------------------------ must flag
  flags("must flag: an invented number", withBullet(2, "The price is up 31% over 6 months."), "number_not_in_inputs");
  flags("must flag: a rounded number (24% written as 25%)", withBullet(2, "The price is up about 25% over 6 months."), "number_not_in_inputs");
  flags("must flag: a flipped sign (+3% written as −3%)", withBullet(3, "Before, it was higher 2 weeks later in 9 of 14 cases, usually between −2% and −3%."), "number_not_in_inputs");
  flags("must flag: a flipped sign on the worst case (−4% written as +4%)", withBullet(3, "Before, it was higher 2 weeks later in 9 of 14 cases, and the worst was +4%."), "number_not_in_inputs");
  flags("must flag: a number lifted from a headline (not computed)", withBullet(2, "Shares jumped 7% on data-centre demand."), "number_not_in_inputs");
  flags("must flag: advice phrasing ('a good time to')", withBullet(2, "This could be a good time to look at the share."), "advice_phrasing");
  flags("must flag: 'consider'", withBullet(2, "Investors may consider the price trend."), "advice_phrasing");
  flags("must flag: 'take profits'", withBullet(2, "Some take profits after a run like this."), "advice_phrasing");
  flags("must flag: an imperative ('Take profits now') via the existing scope guard", withBullet(2, "Take profits now."), "scope_guard");
  flags("must flag: 'should'", withBullet(2, "The share should keep its trend."), "advice_phrasing");
  flags("must flag: a prediction stated as fact ('will rise')", withBullet(2, "The share will rise after results."), "stated_as_fact");
  flags("must flag: 'is set to climb'", withBullet(2, "The share is set to climb."), "stated_as_fact");
  flags("must flag: 'elevated move' framing", withBullet(2, "History shows an elevated move is common."), "elevated_move");
  flags("must flag: jargon without explanation (P/E)", withBullet(1, "Its P/E of 45 is below its 5-year average of 61."), "unexplained_jargon");
  const explained = checkAnalysisText(withBullet(1, "Its P/E (share price divided by yearly profit per share) is 45, below its average of 61."), inputs);
  check("jargon explained in the same sentence passes", explained.passed, `${explained.reason ?? "passed"} ${explained.evidence ?? ""}`);
  flags("must flag: a watch item with no source or event", { ...good, watch: [{ text: "Keep an eye on the chip sector.", ref: "" }] }, "watch_unsourced");
  flags("must flag: a watch item citing an id that was never provided", { ...good, watch: [{ text: "Results, Wed 18 Nov.", ref: "E9" }] }, "watch_unsourced");
  flags("must flag: an event watch item without its date", { ...good, watch: [{ text: "Results are coming up.", ref: "E1" }] }, "watch_unsourced");
  flags("must flag: a source watch item without naming the source", { ...good, watch: [{ text: "Chip export rules, 24 Sep.", ref: "N1" }] }, "watch_unsourced");
  flags("must flag: sources_used naming an unknown news id", { ...good, sources_used: ["N7"] }, "unknown_source");
  flags("must flag: addressing the reader ('your')", withBullet(2, "Your shares are up 24% over 6 months."), "addresses_reader");
  flags("must flag: a two-sentence headline", { ...good, headline: "NVIDIA is growing. Its share is priced below usual." }, "structure");
  flags("must flag: only two bullets", { ...good, bullets: good.bullets.slice(0, 2) }, "structure");
  flags("must flag: a probability the engine never stated", withBullet(2, "There is a 70% chance the price keeps rising."), "freelanced_probability");
  flags("must flag: a sentence over 25 words", withBullet(2, "The price is up 24% over 6 months and it has been going up for a long while now which is a thing that many people who follow it have noticed."), "sentence_too_long");

  // ------------------------------------------------------------- template
  const t = templateAnalysisText(inputs);
  const tc = checkAnalysisText(t, inputs);
  check("template passes every guard it stands in for", tc.passed, `${tc.reason ?? "passed"} ${tc.evidence ?? ""}`);
  check("template includes the history line and a dated watch item", t.bullets.some((b) => b.startsWith("Higher 2 weeks later in 9 of 14")) && t.watch.some((w) => w.ref === "E1" && /18 Nov/.test(w.text)), JSON.stringify(t));
  check("template never quotes a headline carrying a number", !t.watch.some((w) => w.ref === "N2"), JSON.stringify(t.watch));
  const coinInputs: TextInputs = {
    ...inputs,
    name: "Bitcoin",
    symbol: "BTC",
    assetType: "crypto",
    history: directionalHistory(cases([1, 2, -1, 3, 4, -2]), 10),
    scorecard: {
      ...stockCard,
      dimensions: stockCard.dimensions.map((d) => (d.key === "trend" || d.key === "next_event" ? d : { ...d, level: "not_applicable", verdict: "Not applicable", sentence: "There is no company behind it, so company figures don't apply.", inputs: [] })),
    } as Scorecard,
    events: [],
  };
  const ct = templateAnalysisText(coinInputs);
  const cc = checkAnalysisText(ct, coinInputs);
  check("coin template: passes, says there is no company, no company figures", cc.passed && /no company/.test(ct.headline) && !/profit|sales|debt/.test(ct.bullets.join(" ")), `${cc.reason ?? "passed"} ${JSON.stringify(ct)}`);

  // ----------------------------------------------------------- generation
  let calls = 0;
  const twiceBad = await generateAnalysisText(inputs, {
    complete: async () => {
      calls++;
      return withBullet(2, "The share will rise after results.");
    },
    classify: async () => ({ status: "clear" }),
    mode: "strict",
  });
  check("fails twice -> retried exactly once, then the template is stored", calls === 2 && twiceBad.source === "template" && twiceBad.attempts.length === 2 && twiceBad.attempts.every((a) => a.reason === "stated_as_fact"), `${calls} calls, ${twiceBad.source}`);

  calls = 0;
  let secondPrompt = "";
  const fixed = await generateAnalysisText(inputs, {
    complete: async (req) => {
      calls++;
      if (calls === 2) secondPrompt = req.user;
      return calls === 1 ? withBullet(2, "The price is up about 25% over 6 months.") : good;
    },
    classify: async () => ({ status: "clear" }),
    mode: "strict",
  });
  check("fails once, passes on retry -> model text stored, with the first failure recorded", calls === 2 && fixed.source === "model" && fixed.attempts.length === 1 && fixed.attempts[0].reason === "number_not_in_inputs", `${fixed.source}, ${JSON.stringify(fixed.attempts)}`);
  check("the retry is told why the first draft was rejected", /number_not_in_inputs/.test(secondPrompt), secondPrompt.slice(-200));
  check("stored refs are the real row ids, not the prompt's short ids", fixed.text.watch[0].ref === "event:11111111-1111-1111-1111-111111111111" && fixed.text.sources_used[0] === "22222222-2222-2222-2222-222222222222", JSON.stringify(fixed.text));

  const flagged = await generateAnalysisText(inputs, { complete: async () => good, classify: async () => ({ status: "flagged", reason: "personal_direction", rationale: "x" }), mode: "strict" });
  check("classifier flag -> never stored as model text", flagged.source === "template" && flagged.attempts[0].reason === "classifier_flagged", JSON.stringify(flagged.attempts));

  calls = 0;
  const down = await generateAnalysisText(inputs, { complete: async () => (calls++, good), classify: async () => ({ status: "unavailable", detail: "402" }), mode: "strict" });
  check("[DECISION] strict: classifier unavailable -> template, and no pointless retry", down.source === "template" && calls === 1 && down.attempts[0].reason === "classifier_unavailable", `${calls} call(s), ${JSON.stringify(down.attempts)}`);
  const adv = await generateAnalysisText(inputs, { complete: async () => good, classify: async () => ({ status: "unavailable", detail: "402" }), mode: "advisory" });
  check("advisory: classifier unavailable -> model text allowed on layers 1-2", adv.source === "model", adv.source);
  check("default posture for stored analyses is strict (recommended, pending Adam)", analysisClassifierMode(undefined) === "strict" && analysisClassifierMode("advisory") === "advisory", analysisClassifierMode(undefined));

  const err = await generateAnalysisText(inputs, { complete: async () => { throw new Error("HTTP 402"); }, classify: async () => ({ status: "clear" }), mode: "strict" });
  check("model unavailable (402) -> template, error recorded", err.source === "template" && err.attempts.every((a) => a.reason === "model_error"), JSON.stringify(err.attempts));

  // ------------------------------------------------ inputs and stored columns
  const band = { pointEstimate: 21, low: 9, high: 40, confidence: "medium" as const, sampleCount: 14, hitCount: 3 };
  const ti = textInputsFor({
    name: "NVIDIA",
    symbol: "NVDA",
    assetType: "equity",
    factorAnalysis: null,
    sm: null,
    scorecard: stockCard,
    calendar: [
      { id: "c1", event_type: "earnings", event_date: "2026-11-18", metadata: { source: "sec_estimate", based_on: "2025-11-19" } },
      { id: "c2", event_type: "ex_dividend", event_date: "2026-12-04", metadata: {} },
      { id: "c3", event_type: "split", event_date: "2026-12-10", metadata: {} },
    ],
    news: Array.from({ length: 9 }, (_, k) => ({ id: `n${k}`, title: `Headline ${k}`, source_name: "Reuters", published_at: "2026-09-24T10:00:00Z" })),
    band,
  });
  check(
    "calendar -> events with short ids; only earnings/dividend dates; estimate flag kept",
    ti.events.length === 2 && ti.events[0].id === "E1" && ti.events[0].rowId === "c1" && ti.events[0].estimated && ti.events[1].kind === "ex_dividend",
    JSON.stringify(ti.events),
  );
  check("news capped at 6 headlines, cited as N1..N6", ti.news.length === 6 && ti.news[5].id === "N6", ti.news.map((n) => n.id).join(","));
  check("no factor analysis -> noHistoryReason 'no_price_history', no history", ti.history === null && ti.noHistoryReason === "no_price_history", String(ti.noHistoryReason));
  check("the >=5% band travels only as a trader figure", ti.trader?.moveBandLow === 9 && ti.trader?.moveBandHigh === 40, JSON.stringify(ti.trader));

  const cols = directionColumns(null, twiceBad);
  check(
    "stored failures are reason codes only - rejected drafts never land on the publicly readable row",
    JSON.stringify(cols.text_failures) === JSON.stringify([{ reason: "stated_as_fact" }, { reason: "stated_as_fact" }]) && !JSON.stringify(cols).includes("will rise"),
    JSON.stringify(cols.text_failures),
  );
  check("no similar moments -> direction columns null, text still stored", cols.direction_n === null && cols.direction_p25 === null && cols.text_source === "template" && typeof cols.headline === "string", JSON.stringify({ n: cols.direction_n, src: cols.text_source }));
  const sm = {
    history,
    factorConditions: [{ key: "trend", state: "uptrend", label: "x" }],
    baseCount: 20,
    cases: [],
    conditions: [
      { key: "earnings_window" as const, label: "", today: "not_within", kept: true, reason: "applied" as const, nBefore: 20, nAfter: 16 },
      { key: "trend_level" as const, label: "", today: "Rising", kept: true, reason: "applied" as const, nBefore: 16, nAfter: 14 },
    ],
  };
  const cols2 = directionColumns(sm, fixed);
  check(
    "direction columns carry the engine's figures exactly",
    cols2.direction_n === 14 && cols2.direction_higher === 9 && cols2.direction_p25 === -1.8 && cols2.direction_median === 1.5 && cols2.direction_p75 === 3 && cols2.direction_worst === -4 && cols2.direction_best === 6 && cols2.direction_confidence === "medium" && cols2.text_source === "model",
    JSON.stringify(cols2).slice(0, 300),
  );
  check(
    "matched-on words: factor state and kept conditions, duplicates removed",
    JSON.stringify(matchedOnWords(sm)) === JSON.stringify(["a rising price trend", "no results due within 7 trading days"]),
    JSON.stringify(matchedOnWords(sm)),
  );

  check(
    "plain names: corporate suffixes dropped, SEC capitals softened, a fund goes by its symbol",
    plainName("NVIDIA Corporation", "NVDA", "equity") === "NVIDIA" && plainName("COCA COLA CO", "KO", "equity") === "Coca Cola" && plainName("Apple Inc.", "AAPL", "equity") === "Apple" && plainName("Amazon.com, Inc.", "AMZN", "equity") === "Amazon.com" && plainName("AT&T INC", "T", "equity") === "AT&T" && plainName("State Street SPDR S&P 500 ETF Trust", "SPY", "etf") === "SPY" && plainName("Bitcoin", "BTC", "crypto") === "Bitcoin",
    [plainName("NVIDIA Corporation", "NVDA", "equity"), plainName("COCA COLA CO", "KO", "equity"), plainName("AT&T INC", "T", "equity")].join(" | "),
  );
  const decoded = textInputsFor({ name: "Microsoft Corporation", symbol: "MSFT", assetType: "equity", factorAnalysis: null, sm: null, scorecard: stockCard, calendar: [], news: [{ id: "x", title: "Microsoft&#x2019;s stock has roared back", source_name: "MarketWatch Top Stories (RSS)", published_at: "2026-09-25T00:00:00Z" }], band });
  check("headline titles decoded and feed suffix dropped before the model sees them", decoded.news[0].title === "Microsoft’s stock has roared back" && decoded.news[0].source === "MarketWatch Top Stories" && plainSource("Yahoo Finance News (RSS)") === "Yahoo Finance News" && decoded.name === "Microsoft", JSON.stringify(decoded.news[0]));

  return { suiteName: "Analysis text (model writes words; guards fail closed to a template)", gating: true, cases: out };
}

async function main() {
  const suite = await runAnalysisTextSuite();
  console.log(`Report written to ${writeReport([suite])}`);
  const failed = suite.cases.filter((c) => c.status === "fail");
  for (const c of failed) console.log(`FAIL: ${c.name} - ${c.detail}`);
  console.log(`${suite.cases.length - failed.length}/${suite.cases.length} passed.`);
  if (failed.length > 0) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
