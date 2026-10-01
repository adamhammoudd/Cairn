// No assistant question ends in an empty answer (fix/assistant-empty-answers).
//
// Reproduces the stored 2026-10-01 record - "what do you think about the Chinese
// stock market": news empty, symbol lookup empty, web search off - and the
// guard / fallback / proxy / web-count behaviour around it. Real agent, tools
// and guards; the data layer and the model are mocked.
//
// Run: npx tsx --conditions=react-server scripts/tests/assistant-empty-answers.ts

import { pathToFileURL } from "node:url";
import { runAssistantTurn, type ChatFn } from "@/lib/ai/assistant/agent";
import { checkAnswer, checkCitations, checkScope } from "@/lib/ai/assistant/guards";
import type { AssistantData, PriceSummaryData } from "@/lib/ai/assistant/data";
import type { AnswerDraft, AssistantSource, ToolOutcome } from "@/lib/ai/assistant/types";
import type { ChatRequest, ChatResponse } from "@/lib/ai/llm";
import { DEFAULT_DISPLAY_PREFS } from "@/lib/display-prefs";
import { mockData } from "./assistant-transcripts";
import { writeReport, type SuiteResult, type TestCase } from "./report";

const GENERIC = /here is what cairn's data shows/i;
const FROM_ABOVE = /written by cairn directly from the data above/i;

const outcome = (name: ToolOutcome["name"], o: Partial<ToolOutcome> = {}): ToolOutcome => ({ name, args: {}, ok: true, label: name, data: {}, sources: [], facts: [], tiles: [], ms: 1, ...o });
const emptyNews = outcome("get_news", { label: "news", data: { error: "No stored news in the last 7 days." }, error: "No stored news in the last 7 days." });
const newsWithItems = outcome("get_news", {
  label: "news",
  data: { headlines: [{ title: "China stocks rally", source: "Reuters", date: "Wed 30 Sep" }] },
  sources: [{ kind: "news", title: "China stocks rally", publisher: "Reuters", url: "https://r.example/1", date: "2026-09-30" }],
  facts: ['"China stocks rally" (Reuters, Wed 30 Sep).'],
});
const webOff = outcome("web_search", { ok: false, label: "the web", data: { error: "Web search is not switched on for Cairn yet." }, error: "Web search is not switched on for Cairn yet.", notRun: true });
const webItems = outcome("web_search", { label: "the web", untrusted: true, data: { results: [{ title: "x" }] }, sources: [{ kind: "web", title: "x", publisher: "reuters.com", url: "https://reuters.com/x", date: null }] });
const SRC: AssistantSource[] = [{ n: 1, kind: "news", title: "China stocks rally", publisher: "Reuters", url: "https://r.example/1", date: "2026-09-30" }];
const draft = (heading: "What's happening" | "The business", body: string, lead = "Here is the answer."): AnswerDraft => ({ lead, tiles: [], sections: [{ heading, body }], follow_ups: ["a?", "b?"] });

const EEM: PriceSummaryData = {
  symbol: "EEM", name: "iShares MSCI Emerging Markets ETF", assetType: "etf", last: { price: 54.12, date: "2026-09-30", source: "last_close" }, dayChangePct: 0.6,
  changes: [{ window: "week", pct: 1.4 }, { window: "month", pct: -2.3 }, { window: "6 months", pct: 8.9 }, { window: "1 year", pct: 17.6 }], high52: 56.4, low52: 41.2, bars: 501, currency: "USD",
};
const SPY: PriceSummaryData = { ...EEM, symbol: "SPY", name: "State Street SPDR S&P 500 ETF Trust", last: { price: 561.3, date: "2026-09-30", source: "last_close" }, high52: 580.1, low52: 480.2, bars: 8475 };
const XLE: PriceSummaryData = { ...EEM, symbol: "XLE", name: "State Street Energy Select Sector SPDR ETF", last: { price: 88.4, date: "2026-09-30", source: "last_close" }, high52: 95.2, low52: 77.3 };

function dataWith(o: { news?: boolean; symbols?: boolean; web?: "off" | "empty" | "fail" | "on"; failPrices?: string[]; noCards?: boolean } = {}): AssistantData {
  const base = mockData({ failPrices: o.failPrices });
  const tracked: Record<string, PriceSummaryData> = { EEM, SPY, XLE };
  return {
    ...base,
    async news(a) {
      return o.news === false ? [] : base.news(a);
    },
    async findSymbol(q) {
      return o.symbols === false ? [{ symbol: q.toUpperCase(), name: q, assetType: null, status: "not_found", bars: null }] : base.findSymbol(q);
    },
    async priceSummary(s) {
      return tracked[s] ?? (o.noCards ? null : base.priceSummary(s));
    },
    async scorecard(s) {
      return o.noCards ? null : base.scorecard(s);
    },
    async web() {
      if (o.web === "on") return { ok: true, provider: "brave", summary: "", results: [{ title: "China stocks edge higher", url: "https://www.reuters.com/markets/china", publisher: "Reuters", snippet: "Shares rose." }], costUsd: 0.005 };
      if (o.web === "empty") return { ok: false, provider: "brave", summary: "", results: [], costUsd: 0, error: "The search returned no citable pages." };
      if (o.web === "fail") return { ok: false, provider: "brave", summary: "", results: [], costUsd: 0, error: "Brave search HTTP 500" };
      return { ok: false, provider: "off", summary: "", results: [], costUsd: 0, error: "Web search is not switched on for Cairn yet." };
    },
  };
}

interface Script {
  rounds?: [string, Record<string, unknown>][][];
  compose?: ((prompt: string) => AnswerDraft)[];
  throwOnCompose?: boolean;
}
async function turn(message: string, script: Script, data: AssistantData, usePortfolio = true) {
  let round = 0;
  let attempt = 0;
  const chat: ChatFn = async (req: ChatRequest): Promise<ChatResponse> => {
    const text = req.messages.map((m) => m.content ?? "").join("\n");
    const reply = (message: ChatResponse["message"]): ChatResponse => ({ message, finishReason: "stop", usage: { promptTokens: 1000, completionTokens: 100 }, model: "mock" });
    if (req.tools) {
      const calls = script.rounds?.[round++] ?? [];
      return reply({ role: "assistant", content: calls.length ? null : "DONE", ...(calls.length ? { tool_calls: calls.map(([n, a], i) => ({ id: `c${round}${i}`, type: "function" as const, function: { name: n, arguments: JSON.stringify(a) } })) } : {}) });
    }
    if (script.throwOnCompose || !script.compose) throw new Error("HTTP 402 payment required");
    const fn = script.compose[Math.min(attempt++, script.compose.length - 1)];
    return reply({ role: "assistant", content: JSON.stringify(fn(text)) });
  };
  return runAssistantTurn({ message, history: [], ctx: { data, plan: "premium", prefs: DEFAULT_DISPLAY_PREFS, usePortfolio }, chat, classify: async () => ({ status: "clear" as const }), today: "2026-10-01" });
}
const CHINA_ROUND: Script["rounds"] = [[["get_news", { query: "China stock market", days: 7 }], ["find_symbol", { query: "China stock market" }], ["web_search", { query: "Chinese stock market this week" }]]];

export async function runAssistantEmptyAnswersSuite(): Promise<SuiteResult> {
  const cases: TestCase[] = [];
  const add = (name: string, ok: boolean, detail: string, attachment?: string) => cases.push({ name, status: ok ? "pass" : "fail", detail, attachment });

  // ---- 1. the guard: a statement of absence needs a tool outcome, not a citation ----
  const absent = "No news articles were found for the Chinese stock market in the last 7 days.";
  add("guard: 'no news found' PASSES when get_news returned nothing", checkCitations(draft("What's happening", absent), [], [emptyNews]).passed, JSON.stringify(checkCitations(draft("What's happening", absent), [], [emptyNews])));
  add("guard: the same sentence FAILS when get_news returned articles", !checkCitations(draft("What's happening", absent), SRC, [newsWithItems]).passed, "outcome has articles");
  add("guard: the same sentence FAILS when no news tool ran at all", !checkCitations(draft("What's happening", absent), [], []).passed, "no outcome");
  add("guard: an invented claim FAILS even when get_news was empty", !checkCitations(draft("What's happening", "Chinese regulators announced a stimulus package on Monday."), [], [emptyNews]).passed, "invented");
  add("guard: an absence statement can't carry a smuggled claim", !checkCitations(draft("What's happening", "No news was found, but Alibaba's chief executive resigned this week."), [], [emptyNews]).passed, "smuggled");
  const webAbsent = "Web search isn't turned on yet, so I couldn't check the web.";
  add("guard: an absence about the web needs a web outcome that is empty or failed", checkCitations(draft("What's happening", webAbsent), [], [webOff]).passed && !checkCitations(draft("What's happening", webAbsent), [], [emptyNews]).passed, "web off vs news only");
  add("guard: 'no web results' FAILS when the search returned pages", !checkCitations(draft("What's happening", "The web search returned no results."), SRC, [webItems]).passed, "web had items");
  add("guard: a news sentence with content and no citation still FAILS", !checkCitations(draft("What's happening", "Chinese shares rose on Tuesday."), SRC, [newsWithItems]).passed, "uncited");

  // ---- 1b. advice_phrasing vs scorecard words ----
  const SCORE = outcome("get_scorecard", { data: { scores: [{ part: "Price trend", verdict: "Weak", level: "weak" }, { part: "Price vs profit", verdict: "Cheaper than usual", level: "strong" }] } });
  const scope = (t: string) => checkScope(draft("The business", t), [SCORE]);
  for (const t of ["Cairn rates its price trend as weak.", "The scorecard says the growth is strong.", "Its price is cheaper than usual for its profit.", "Price trend: Weak. Up 2% over 6 months."]) {
    add(`scorecard words PASS: "${t}"`, scope(t).passed, `${scope(t).reason ?? ""} ${scope(t).evidence ?? ""}`);
  }
  add('scorecard label with "considered" PASSES when the label is in a tool result: "the price trend is considered weak"', scope("The price trend is considered weak.").passed, `${scope("The price trend is considered weak.").reason}`);
  for (const t of ["You should sell it.", "It looks worth buying.", "Now is a good time to get in.", "Consider buying more.", "It is considered a bargain.", "It is considered a good investment."]) {
    add(`advice still FLAGS: "${t}"`, !scope(t).passed, scope(t).reason ?? "not flagged");
  }

  // ---- 3b. no view on whether a market is a good or bad place to invest ----
  for (const t of [
    "China is a good place to invest right now.",
    "I think Chinese stocks look promising.",
    "In my opinion the market is a bad bet.",
    "Chinese equities are a great investment.",
    "Investors are bullish on China.",
    "The market looks attractive here.",
    "Europe is a risky place to put money.",
    "It's worth investing in emerging markets.",
  ]) {
    const r = checkScope(draft("The business", t), []);
    add(`probe: no market view - FLAGS "${t}"`, !r.passed, r.reason ?? "not flagged");
  }
  add("probe: a quoted headline with a view is reported text, not Cairn's voice", checkScope(draft("What's happening", 'Reuters ran "Is China a good place to invest?" this week [1].'), []).passed, "quoted");
  add("probe: claiming a web search that did not run is rejected", !checkAnswer({ lead: "I searched the web and Chinese stocks rose this week.", tiles: [], sections: [], follow_ups: ["a?", "b?"] }, [webOff], []).passed, "claims search");

  // ---- the replay: stored record ----
  const q = "what do you think about the Chinese stock market";
  const r = await turn(q, { rounds: CHINA_ROUND, compose: [() => draft("What's happening", absent, "I could not find recent coverage of the Chinese stock market.")] }, dataWith({ news: false, symbols: false, web: "off" }));
  add("replay: web search that never ran is not counted", r.meta.usage.webSearches === 0, `webSearches=${r.meta.usage.webSearches}`);
  add("replay: the correct 'no news found' is no longer rejected", !r.meta.guardFailures.some((g) => g.reason === "uncited_news_claim"), r.meta.guardFailures.map((g) => g.reason).join(", ") || "no failures", `Q: ${q}\nChecked: ${r.meta.checked.join(", ")}\n\n${r.markdown}`);
  add("replay: the Checked line does not list 'the web' for a failed call", !r.meta.checked.includes("the web") && r.meta.checked.some((c) => /web search: not switched on/.test(c)), r.meta.checked.join(" | "));
  add("replay: the answer says web search isn't turned on, plainly", /web search isn't turned on yet/i.test(r.markdown), r.markdown.slice(0, 200));
  add("replay: opinion question gets 'I don't give opinions'", /I don't give opinions/.test(r.markdown), r.markdown.slice(0, 120));
  add("replay: never claims to have searched", !/\bsearched the web\b/i.test(r.markdown), "no search claim");

  // ---- 2. the fallback says what happened, in every combination ----
  const fb: [string, string, AssistantData, RegExp[], RegExp[], Script["rounds"]?][] = [
    ["nothing found, web off", q, dataWith({ news: false, symbols: false, web: "off", noCards: true }), [/couldn't find/i, /web search isn't turned on yet/i, /Chinese stock market/i], [GENERIC, FROM_ABOVE], CHINA_ROUND],
    ["nothing found, web ran but empty", "tell me about the Chinese stock market", dataWith({ news: false, symbols: false, web: "empty", noCards: true }), [/couldn't find/i, /web search/i], [GENERIC, FROM_ABOVE], CHINA_ROUND],
    ["nothing found, web failed", "tell me about the Chinese stock market", dataWith({ news: false, symbols: false, web: "fail", noCards: true }), [/couldn't find/i, /web search (?:failed|didn't work)/i], [GENERIC, FROM_ABOVE], CHINA_ROUND],
    ["opinion, nothing found", q, dataWith({ news: false, symbols: false, web: "off", noCards: true }), [/I don't give opinions or tell anyone what to buy, hold or sell/, /couldn't find/i], [GENERIC, FROM_ABOVE], CHINA_ROUND],
    ["prices failed, nothing else", "How's NVIDIA looking?", dataWith({ failPrices: ["NVDA"], news: false, noCards: true, web: "off" }), [/couldn't (?:read|find)/i], [GENERIC, FROM_ABOVE]],
    ["opinion with data", "what do you think about NVIDIA?", dataWith(), [/^I don't give opinions or tell anyone what to buy, hold or sell\. Here is what the data says\./], [FROM_ABOVE]],
    ["advice with data", "Should I sell NVDA?", dataWith(), [/^I don't give opinions or tell anyone what to buy, hold or sell\. Here is what the data says\./], [FROM_ABOVE]],
    ["plain question with data", "How's NVIDIA looking?", dataWith(), [/NVIDIA/], []],
  ];
  for (const [name, message, data, must, mustNot, rounds] of fb) {
    const x = await turn(message, { rounds, throwOnCompose: true }, data);
    const lead = x.answer.lead;
    const hasFacts = x.answer.sections.length > 0 || x.answer.tiles.length > 0;
    const t = `Q: ${message}\nChecked: ${x.meta.checked.join(", ")}\n\n${x.markdown}\n\nFollow-ups: ${x.meta.followUps.join(" / ")}`;
    add(`fallback [${name}]: lead states the real situation`, must.every((m) => m.test(x.markdown)) && mustNot.every((m) => !m.test(x.markdown)), lead, t);
    add(`fallback [${name}]: generic "Here is what Cairn's data shows" only with facts under it`, !GENERIC.test(lead) || hasFacts, `facts=${hasFacts}`);
    add(`fallback [${name}]: 2-3 follow-ups, none empty`, x.meta.followUps.length >= 2 && x.meta.followUps.length <= 3 && x.meta.followUps.every((f) => f.trim()), x.meta.followUps.join(" / "));
    add(`fallback [${name}]: passes the guards it stands in for`, checkAnswer(x.answer, x.outcomes, x.meta.sources).passed, JSON.stringify(checkAnswer(x.answer, x.outcomes, x.meta.sources)));
  }

  // ---- 3. market, country and theme questions ----
  const mk: [string, RegExp, RegExp][] = [
    ["what do you think about the Chinese stock market", /closest prox(?:y|ies)/i, /EEM/],
    ["How are European stocks doing?", /doesn't track|does not track/i, /Cairn does track/i],
    ["How are emerging markets doing?", /EEM|iShares MSCI Emerging Markets/, /\$54\.12/],
    ["What's happening with AI stocks?", /doesn't track|does not track/i, /Cairn does track/i],
  ];
  for (const [message, a, b] of mk) {
    const x = await turn(message, { throwOnCompose: true }, dataWith({ news: false, symbols: false, web: "off" }));
    add(`market: "${message}" resolves to labelled proxies or an honest 'nothing tracked'`, a.test(x.markdown) && b.test(x.markdown), x.answer.lead, `Q: ${message}\nChecked: ${x.meta.checked.join(", ")}\n\n${x.markdown}\n\nFollow-ups: ${x.meta.followUps.join(" / ")}`);
    add(`market: "${message}" shows no view on whether to invest`, !/good place|bad place|bullish|bearish|attractive|promising/i.test(x.markdown), "no view");
  }
  {
    const good = (): AnswerDraft => ({
      lead: "The closest Cairn tracks is EEM, an emerging-markets fund, at $54.12, +1.4% over a week.",
      tiles: [{ label: "EEM", value: "$54.12", note: "" }],
      sections: [{ heading: "The business", body: "Cairn doesn't track emerging markets as a whole; EEM is the closest proxy it has. It moved +1.4% over a week, -2.3% over a month and +8.9% over 6 months." }],
      follow_ups: ["How's SPY doing?", "How's my portfolio doing?"],
    });
    const x = await turn("How are emerging markets doing?", { compose: [good] }, dataWith({ news: false }));
    add("market: model answer from proxy figures passes the guards with proxy name and currency", x.meta.source === "model" && /\$54\.12/.test(x.markdown), `${x.meta.source} ${x.meta.guardFailures.map((g) => g.reason).join(",")}`, x.markdown);
    const v = await turn("How are emerging markets doing?", { compose: [() => ({ lead: "Emerging markets are a good place to invest right now.", tiles: [], sections: [], follow_ups: ["a?", "b?"] })] }, dataWith({ news: false }));
    add("market: a model that states a view is caught and the view never reaches the reader", v.meta.guardFailures.length > 0 && !/good place to invest/i.test(v.markdown), v.meta.guardFailures.map((g) => g.reason).join(","));
  }

  // ---- 4. web search: counting and honesty ----
  {
    const oil: Script = { rounds: [[["web_search", { query: "oil prices this week" }]]], throwOnCompose: true };
    const x = await turn("What's happening in oil prices this week?", oil, dataWith({ web: "off", news: false, symbols: false }));
    add("web: a call that failed before sending is not counted in usage.webSearches", x.meta.usage.webSearches === 0, `${x.meta.usage.webSearches}`);
    add("web: and costs nothing beyond the model tokens", x.outcomes.every((o) => !o.costUsd), `costUsd=${x.meta.costUsd}`);
    const on = await turn("What's happening in oil prices this week?", { ...oil, rounds: [[["web_search", { query: "oil prices this week" }]]] }, dataWith({ web: "on", news: false, symbols: false }));
    add("web: a search that was sent IS counted and costed", on.meta.usage.webSearches === 1 && on.outcomes.some((o) => (o.costUsd ?? 0) > 0), `${on.meta.usage.webSearches}`);
    add("web: when sent, the Checked line lists the web", on.meta.checked.includes("the web"), on.meta.checked.join(", "));
  }

  return { suiteName: "Assistant never ends in an empty answer (guard absence, fallback, market proxies, web honesty)", gating: true, cases };
}

async function main() {
  const suite = await runAssistantEmptyAnswersSuite();
  console.log(`Report written to ${writeReport([suite])}`);
  const failed = suite.cases.filter((c) => c.status === "fail");
  for (const c of suite.cases) console.log(`${c.status === "pass" ? "PASS" : "FAIL"} ${c.name} - ${c.detail}`);
  if (process.argv.includes("--transcripts")) for (const c of suite.cases) if (c.attachment) console.log(`\n----\n${c.attachment}`);
  console.log(`${suite.cases.length - failed.length}/${suite.cases.length} passed.`);
  if (failed.length > 0) process.exit(1);
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) void main();
