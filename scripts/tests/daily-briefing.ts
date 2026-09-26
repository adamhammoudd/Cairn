// Section 6 (feat/daily-briefing): "what changed for what you own".
//
// Every card comes from a deterministic rule over stored data - no model, no
// manufactured news. These cases pin each rule at its boundary, the ranking,
// the headline counts (including the quiet day), the holdings line, "Coming
// up", "Your mix", crypto, and that every sentence passes the scope guard.
//
// Run: npx tsx --conditions=react-server scripts/tests/daily-briefing.ts

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  BRIEFING_RULES,
  buildBriefing,
  unusualMove,
  moveHistory,
  scorecardChanges,
  holdingLine,
  mixSummary,
  numberWord,
  type BriefingHolding,
} from "@/lib/daily-briefing";
import { snapshotCards } from "./scorecard";
import { checkScopeGuard } from "@/lib/ai/scope-guard";
import { writeReport, type SuiteResult, type TestCase } from "./report";

const TODAY = "2025-09-26";

/** Daily closes ending on TODAY; `pattern(i)` is the day's return. */
function prices(n: number, pattern: (i: number) => number, start = 100) {
  const out: { date: string; close: number }[] = [];
  let p = start;
  for (let i = 0; i < n; i++) {
    p = p * (1 + pattern(i));
    out.push({ date: new Date(Date.parse(`${TODAY}T00:00:00Z`) - (n - 1 - i) * 86_400_000).toISOString().slice(0, 10), close: p });
  }
  return out;
}

function holding(over: Partial<BriefingHolding> & { symbol: string }): BriefingHolding {
  const cards = snapshotCards();
  return {
    name: over.symbol,
    assetType: "equity",
    quantity: 10,
    value: 1000,
    pricesAsc: prices(400, (i) => (i % 2 ? 0.004 : -0.0035)),
    scorecard: cards.PAYR,
    scorecardWeekAgo: null,
    reactions: [],
    dividends: null,
    events: [],
    ...over,
  };
}

export function runDailyBriefingSuite(): SuiteResult {
  const cases: TestCase[] = [];
  const check = (name: string, ok: boolean, detail: string) => cases.push({ name, status: ok ? "pass" : "fail", detail });
  const cards = snapshotCards();

  // ---- unusual move ---------------------------------------------------------
  // Quiet stock (+-0.4% a day), then a 9% drop in the last five sessions.
  const calm = prices(400, (i) => (i >= 395 ? -0.0187 : i % 2 ? 0.004 : -0.0035));
  const um = unusualMove(calm, "equity");
  check("a move over 2x the typical weekly move is unusual", um !== null && um.unusual && um.move < -0.08, `move ${(um!.move * 100).toFixed(1)}%, typical ${(um!.typical * 100).toFixed(2)}%, ratio ${um!.ratio.toFixed(1)}`);
  const normal = unusualMove(prices(400, (i) => (i % 2 ? 0.004 : -0.0035)), "equity");
  check("an ordinary week is not unusual", normal !== null && !normal.unusual, `ratio ${normal?.ratio.toFixed(2)}`);
  // Almost no movement for a year, then +1.2% in a week: 10x its "typical" week, but still tiny.
  const flat = unusualMove(prices(400, (i) => (i >= 395 ? 0.0024 : i % 2 ? 0.0003 : -0.0003)), "equity");
  check("a big multiple of a tiny move is not unusual (2% floor)", flat !== null && flat.ratio > 2 && !flat.unusual, `move ${(flat!.move * 100).toFixed(2)}%, ratio ${flat!.ratio.toFixed(1)}`);
  check("too little history -> no judgement", unusualMove(prices(60, () => 0.001), "equity") === null, "60 days");

  // Drops this size and whether they recovered within a month.
  const withDrops = prices(400, (i) => {
    // Three past 10% drops over one week, each followed by a recovery or not.
    if ((i >= 100 && i < 105) || (i >= 200 && i < 205) || (i >= 300 && i < 305)) return -0.021;
    if ((i >= 105 && i < 115) || (i >= 205 && i < 215)) return 0.012; // these two recover
    if (i >= 395) return -0.021; // this week
    return i % 2 ? 0.004 : -0.0035;
  });
  const hist = moveHistory(withDrops, "equity", -0.09);
  check("counts past drops this size and how many recovered within a month", hist.count === 3 && hist.recovered === 2, `${hist.recovered} of ${hist.count}`);

  // ---- scorecard changes ----------------------------------------------------
  const weekAgo = {
    asOf: "2025-09-19",
    levels: Object.fromEntries(cards.PAYR.dimensions.map((d) => [d.key, { level: d.level, verdict: d.verdict }])) as Record<string, { level: string; verdict: string }>,
  };
  weekAgo.levels.health = { level: "strong", verdict: "Strong" };
  weekAgo.levels.trend = { level: "weak", verdict: "Falling" };
  const changes = scorecardChanges(cards.PAYR, weekAgo)!;
  check(
    "level changes since last week, split into weakened and improved",
    changes.weakened.map((c) => c.label).join() === "Financial health" && changes.improved.map((c) => c.label).join() === "Price trend",
    `weakened ${changes.weakened.map((c) => `${c.label} ${c.from}->${c.to}`).join()} | improved ${changes.improved.map((c) => `${c.label} ${c.from}->${c.to}`).join()}`,
  );
  check("no week-old card -> no change claimed", scorecardChanges(cards.PAYR, null) === null, "null");

  // ---- the whole briefing -----------------------------------------------------
  const nvda = holding({
    symbol: "NVDA",
    name: "NVIDIA",
    value: 3390,
    scorecard: cards.GROW,
    events: [{ type: "earnings", date: "2025-10-01" }],
    reactions: [0.08, -0.07, 0.03, 0.09, -0.02, 0.065, 0.011, -0.12].map((m, i) => ({ release_date: `2025-0${i + 1}-10`, reaction_date: `2025-0${i + 1}-11`, move: m })),
  });
  const msft = holding({
    symbol: "MSFT",
    name: "Microsoft",
    value: 3000,
    dividends: { latest: { perShare: 0.91, periodEnd: "2025-09-30", filed: "2025-09-20" }, previous: { perShare: 0.83 } },
    events: [{ type: "ex_dividend", date: "2025-10-09", perShare: 0.91 }],
  });
  const btc = holding({ symbol: "BTC", name: "Bitcoin", assetType: "crypto", value: 1750, quantity: 0.02, scorecard: cards.BTC, pricesAsc: prices(400, (i) => (i >= 393 ? -0.0134 : i % 2 ? 0.006 : -0.005)) });
  const amzn = holding({ symbol: "AMZN", name: "Amazon", value: 2190, scorecardWeekAgo: weekAgo });
  const b = buildBriefing({ today: TODAY, holdings: [nvda, msft, btc, amzn], exposureEnabled: true });

  check(
    "headline counts what changed, in words, and says nothing needs the reader",
    b.headline === "Four things changed for what you own. Nothing needs you today.",
    b.headline,
  );
  check("at most three cards", b.cards.length === 3, b.cards.map((c) => `${c.tag}:${c.symbol}`).join(", "));
  check(
    "ranking: unusual move, then weakened scorecard, then upcoming earnings",
    b.cards.map((c) => `${c.tag}:${c.symbol}`).join(", ") === "Unusual move:BTC, Changed:AMZN, Coming up:NVDA",
    b.cards.map((c) => `${c.tag}:${c.symbol} "${c.title}"`).join(" | "),
  );
  check("the rest are counted, not hidden", b.moreCount === 1, `more: ${b.moreCount}`);
  const nvCard = b.cards.find((c) => c.symbol === "NVDA")!;
  check(
    "earnings card: days, and past results-day moves from real releases",
    nvCard.title === "Reports earnings in 5 days" && /On its last 8 results days the share moved 5% or more 5 times\./.test(nvCard.body.join(" ")),
    `${nvCard.title}: ${nvCard.body.join(" ")}`,
  );
  const btcCard = b.cards.find((c) => c.symbol === "BTC")!;
  check("unusual move card: size and its usual swing", /^Down \d+% this week$/.test(btcCard.title) && /usual weekly swing/.test(btcCard.body.join(" ")), `${btcCard.title}: ${btcCard.body.join(" ")}`);
  check("cards link to the analysis", b.cards.every((c) => c.href === `/ticker/${encodeURIComponent(c.symbol)}`), b.cards.map((c) => c.href).join(" "));

  const dividendOnly = buildBriefing({ today: TODAY, holdings: [msft], exposureEnabled: true });
  check(
    "dividend raise card, with coverage from the scorecard",
    dividendOnly.cards[0]?.tag === "Good news" && dividendOnly.cards[0].title === "Raised its dividend by 10%" && /free cash flow/.test(dividendOnly.cards[0].body.join(" ")),
    `${dividendOnly.cards[0]?.tag}: ${dividendOnly.cards[0]?.title} ${dividendOnly.cards[0]?.body.join(" ")}`,
  );
  const oldDividend = buildBriefing({ today: TODAY, holdings: [{ ...msft, dividends: { ...msft.dividends!, latest: { ...msft.dividends!.latest, filed: "2025-07-01" } } }], exposureEnabled: true });
  check("an old dividend filing is not news", !oldDividend.cards.some((c) => c.title.includes("dividend")), oldDividend.cards.map((c) => c.title).join(", ") || "no cards");

  const quiet = buildBriefing({ today: TODAY, holdings: [holding({ symbol: "KO", name: "Coca-Cola" })], exposureEnabled: true });
  check(
    "a quiet day says so plainly; nothing is manufactured",
    quiet.cards.length === 0 && quiet.headline === "Nothing changed for what you own. Nothing needs you today." && quiet.quietNote !== null,
    `${quiet.headline} | ${quiet.quietNote}`,
  );
  check("no holdings -> an invitation, not a briefing", buildBriefing({ today: TODAY, holdings: [], exposureEnabled: true }).headline === "Add what you own to get a briefing about it.", "empty");

  // ---- holdings at a glance ----------------------------------------------------
  check("holdings line for a company", holdingLine(cards.GROW, "equity") === "A strong, growing company. The share is priced high for its profit.", holdingLine(cards.GROW, "equity"));
  check("holdings line for a coin", holdingLine(cards.BTC, "crypto") === "No company behind it, so only the price trend applies, and it is falling.", holdingLine(cards.BTC, "crypto"));
  const nvRow = b.holdings.find((h) => h.symbol === "NVDA")!;
  check("glance row carries four mini bars (price vs profit, growth, health, trend)", nvRow.bars.map((x) => `${x.key}:${x.level}`).join() === "valuation:weak,growth:strong,health:strong,trend:strong", nvRow.bars.map((x) => `${x.key}:${x.level}`).join());

  // ---- coming up ------------------------------------------------------------------
  check(
    "coming up: dated, in order, with the approximate dividend to the reader",
    b.comingUp.map((c) => `${c.date} ${c.title}`).join(" | ") === "2025-10-01 NVIDIA earnings | 2025-10-09 Microsoft dividend cut-off date" &&
      Math.abs((b.comingUp[1].amountUsd ?? 0) - 9.1) < 1e-9,
    b.comingUp.map((c) => `${c.date} ${c.title} ${c.amountUsd ?? ""}`).join(" | "),
  );
  // The window is 30 days (it was 14, which left most months' earnings off).
  const later = holding({
    symbol: "KO",
    name: "Coca-Cola",
    events: [
      { type: "earnings", date: "2025-10-16" }, // day 20
      { type: "ex_dividend", date: "2025-10-26", perShare: 0.51 }, // day 30
      { type: "dividend_payment", date: "2025-10-27", perShare: 0.51 }, // day 31
    ],
  });
  const window = buildBriefing({ today: TODAY, holdings: [later], exposureEnabled: true }).comingUp;
  check(
    "coming up: the next 30 days - day 20 and day 30 in, day 31 out",
    BRIEFING_RULES.comingUpDays === 30 && window.map((c) => c.date).join(",") === "2025-10-16,2025-10-26",
    window.map((c) => `${c.date} ${c.title}`).join(" | ") || "none",
  );
  const loader = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../src/lib/daily-briefing-data.ts"), "utf8");
  check(
    "coming up: the loader fetches events for the same window the rule shows",
    /\.lte\("event_date", isoDaysAgo\(today, -BRIEFING_RULES\.comingUpDays\)\)/.test(loader),
    "src/lib/daily-briefing-data.ts calendar_events read",
  );
  const noExposure = buildBriefing({ today: TODAY, holdings: [nvda, msft, btc, amzn], exposureEnabled: false });
  check("personal amounts and the mix are off without the flag", noExposure.mix === null && noExposure.comingUp.every((c) => c.amountUsd === null), "flag off");

  // ---- your mix -----------------------------------------------------------------------
  check(
    "mix: one holding over 40%",
    mixSummary([{ symbol: "A", name: "Alpha", value: 50 }, { symbol: "B", name: "Beta", value: 30 }, { symbol: "C", name: "Gamma", value: 20 }])!.sentence === "Alpha is 50% of your portfolio.",
    mixSummary([{ symbol: "A", name: "Alpha", value: 50 }, { symbol: "B", name: "Beta", value: 30 }, { symbol: "C", name: "Gamma", value: 20 }])!.sentence,
  );
  const two = mixSummary([{ symbol: "N", name: "NVIDIA", value: 34 }, { symbol: "M", name: "Microsoft", value: 30 }, { symbol: "A", name: "Amazon", value: 22 }, { symbol: "B", name: "Bitcoin", value: 14 }])!;
  check("mix: two holdings over half", two.sentence === "More than half your money is in two holdings." && two.detail === "NVIDIA and Microsoft make up 64% of your portfolio.", `${two.sentence} ${two.detail}`);
  const spread = mixSummary([1, 2, 3, 4, 5].map((i) => ({ symbol: `S${i}`, name: `S${i}`, value: 20 })))!;
  check("mix: spread out", spread.sentence === "Your money is spread across 5 holdings." && spread.detail === "The largest, S1, is 20%.", `${spread.sentence} ${spread.detail}`);

  // ---- every sentence passes the scope guard ----------------------------------------
  const texts = [
    b.headline,
    ...b.cards.flatMap((c) => [c.title, ...c.body]),
    ...b.holdings.map((h) => h.line),
    ...b.comingUp.map((c) => `${c.title}. ${c.detail ?? ""}`),
    b.mix?.sentence ?? "",
    b.mix?.detail ?? "",
    quiet.quietNote ?? "",
  ].filter(Boolean);
  const flagged = texts.filter((t) => !checkScopeGuard(t).passed);
  check("every briefing sentence passes the scope guard", flagged.length === 0, flagged.join(" | ") || `${texts.length} sentences clean`);
  check("number words", numberWord(3) === "Three" && numberWord(12) === "12", `${numberWord(3)} ${numberWord(12)}`);

  return { suiteName: "Daily briefing (what changed for what you own)", gating: true, cases };
}

function main() {
  const suite = runDailyBriefingSuite();
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
