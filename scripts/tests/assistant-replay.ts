// Replays the stored 2026-10-01 record (news empty, symbol lookup empty, web search off)
// through the real agent with a scripted model. Prints the answer the reader gets.
// Run: npx tsx --conditions=react-server scripts/tests/assistant-replay.ts [--web] [--fallback] [--q=...]
import { runAssistantTurn, type ChatFn } from "@/lib/ai/assistant/agent";
import { mockData } from "./assistant-transcripts";
import { DEFAULT_DISPLAY_PREFS } from "@/lib/display-prefs";

const web = process.argv.includes("--web");
const Q = process.argv.find((a) => a.startsWith("--q="))?.slice(4) ?? "what do you think about the Chinese stock market";
const base = mockData();
const EEM = { symbol: "EEM", name: "iShares MSCI Emerging Markets ETF", assetType: "etf", last: { price: 54.12, date: "2026-09-30", source: "last_close" as const }, dayChangePct: 0.6, changes: [{ window: "week" as const, pct: 1.4 }, { window: "month" as const, pct: -2.3 }, { window: "6 months" as const, pct: 8.9 }, { window: "1 year" as const, pct: 17.6 }], high52: 56.4, low52: 41.2, bars: 501, currency: "USD" };
const data = {
  ...base,
  async priceSummary(s: string) { return s === "EEM" ? EEM : base.priceSummary(s); },
  async news() { return []; },
  async findSymbol(q: string) { return [{ symbol: q.toUpperCase(), name: q, assetType: null, status: "not_found" as const, bars: null }]; },
  async web() {
    return web
      ? { ok: true, provider: "brave" as const, summary: "", results: [{ title: "China stocks edge higher as stimulus hopes build", url: "https://www.reuters.com/markets/china-stocks", publisher: "Reuters", snippet: "Chinese shares rose." }], costUsd: 0.005 }
      : { ok: false, provider: "off" as const, summary: "", results: [], costUsd: 0, error: "Web search is not switched on for Cairn yet." };
  },
};
let round = 0;
const chat: ChatFn = async (req) => {
  const text = req.messages.map((m) => m.content ?? "").join("\n");
  const reply = (message: never) => ({ message, finishReason: "stop", usage: { promptTokens: 1000, completionTokens: 100 }, model: "mock" }) as never;
  if (req.tools) {
    const calls = round++ === 0 ? [["get_news", { query: "China stock market", days: 7 }], ["find_symbol", { query: "China stock market" }], ["web_search", { query: "Chinese stock market this week" }]] : [];
    return reply({ role: "assistant", content: calls.length ? null : "DONE", ...(calls.length ? { tool_calls: calls.map(([n, a], i) => ({ id: `c${i}`, type: "function", function: { name: n, arguments: JSON.stringify(a) } })) } : {}) } as never);
  }
  if (process.argv.includes("--fallback")) throw new Error("HTTP 402 payment required");
  const src = text.split("SOURCES (cite as [n]):")[1] ?? "";
  const cm = src.split("\n").find((l) => l.includes("China stocks edge higher"))?.match(/^\[(\d+)\]/);
  const n = cm ? ` [${cm[1]}]` : "";
  return reply({ role: "assistant", content: JSON.stringify(web
    ? { lead: "Chinese stocks rose this week on stimulus hopes.", tiles: [], sections: [{ heading: "What's happening", body: `Chinese shares edged higher as stimulus hopes built${n}.` }], follow_ups: ["How's EEM doing?", "How's my portfolio doing?"] }
    : { lead: "I could not find any recent coverage of the Chinese stock market.", tiles: [], sections: [{ heading: "What's happening", body: "No news articles were found for the Chinese stock market in the last 7 days." }], follow_ups: ["How's my portfolio doing?", "How's SPY doing?"] }) } as never);
};
(async () => {
  const r = await runAssistantTurn({ message: Q, history: [], ctx: { data, plan: "premium", prefs: DEFAULT_DISPLAY_PREFS, usePortfolio: true }, chat, classify: async () => ({ status: "clear" as const }), today: "2026-10-01" });
  console.log(`Q: ${Q}\nChecked: ${r.meta.checked.join(", ")}\nsource: ${r.meta.source}  guard: ${r.meta.guardFailures.map((g) => g.reason).join(", ") || "-"}\nwebSearches: ${r.meta.usage.webSearches}  costUsd: ${r.meta.costUsd}\n\n${r.markdown}\n\nFollow-ups: ${r.meta.followUps.join(" / ")}\n"Written by Cairn..." note shown: ${r.meta.source === "facts" && (r.meta.tiles.length > 0 || r.meta.sources.length > 0)}`);
})();
