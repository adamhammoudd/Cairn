// Phone "Holdings at a glance" (fix/mobile-holdings-labels).
//
// Below 768px the table header ("Holding", "Value", "Price", "Growth"...) is
// hidden, and the phone list drew the four score bars with nothing saying
// what they measured - rows of unlabelled green bars. This renders the REAL
// DailyBriefing and reads the phone list (the md:hidden <ul>) only:
//   - every bar sits beside its label and its verdict word;
//   - a coin shows only Trend, with "No company behind it, so only the price
//     trend is rated";
//   - name, ticker, quantity, value and week change are all on the card.
//
// Run: npx tsx --conditions=react-server scripts/tests/mobile-holdings.ts

import { pathToFileURL } from "node:url";
import type { Briefing, GlanceRow } from "@/lib/daily-briefing";
import { renderComponentHtml } from "./render-helper";
import { writeReport, type SuiteResult, type TestCase } from "./report";

function check(name: string, ok: boolean, detail: string): TestCase {
  return { name, status: ok ? "pass" : "fail", detail };
}

const nvda: GlanceRow = {
  symbol: "NVDA",
  name: "NVIDIA",
  quantity: 12,
  valueUsd: 2146.8,
  weekChangePct: 3.4,
  bars: [
    { key: "valuation", label: "Price vs profit", level: "strong", verdict: "Cheaper than usual" },
    { key: "growth", label: "Growth", level: "strong", verdict: "Strong" },
    { key: "health", label: "Financial health", level: "mixed", verdict: "OK" },
    { key: "trend", label: "Price trend", level: "strong", verdict: "Rising" },
  ],
  line: "A fast-growing company. The share costs less than usual for its profit.",
  href: "/ticker/NVDA",
  assetType: "equity",
  filingNote: null,
};
const btc: GlanceRow = {
  symbol: "BTC",
  name: "Bitcoin",
  quantity: 0.05,
  valueUsd: 5310.2,
  weekChangePct: -1.2,
  bars: [
    { key: "valuation", label: "Price vs profit", level: "not_applicable", verdict: "Not applicable" },
    { key: "growth", label: "Growth", level: "not_applicable", verdict: "Not applicable" },
    { key: "health", label: "Financial health", level: "not_applicable", verdict: "Not applicable" },
    { key: "trend", label: "Price trend", level: "weak", verdict: "Falling" },
  ],
  line: "No company behind it, so only the price trend applies, and it is falling.",
  href: "/ticker/BTC",
  assetType: "crypto",
  filingNote: null,
};
const briefing: Briefing = {
  headline: "A quiet week for what you own.",
  valueUsd: 7457,
  weekChangePct: 0.6,
  biggestEvent: null,
  cards: [],
  moreCount: 0,
  quietNote: "Nothing changed enough to mention.",
  holdings: [nvda, btc],
  comingUp: [],
  mix: null,
};

const text = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();

export function runMobileHoldingsSuite(): SuiteResult {
  const cases: TestCase[] = [];
  const html = renderComponentHtml("src/components/briefing/daily-briefing.tsx", "DailyBriefing", { briefing, dateLabel: "Sun 27 Sep" });
  if (html.startsWith("RENDER FAILED")) return { suiteName: "Phone holdings cards", gating: true, cases: [check("renders", false, html)] };

  const phone = html.match(/<ul[^>]*md:hidden[^>]*>([\s\S]*?)<\/ul>/)?.[1] ?? "";
  cases.push(check("the phone list is present (md:hidden)", phone.length > 0, `${phone.length} chars`));
  const cards = phone.split(/<li\b/).slice(1);
  cases.push(check("one card per holding", cards.length === 2, String(cards.length)));
  const [n, b] = cards.map(text);

  cases.push(check("NVDA card: name, ticker and quantity", /NVIDIA/.test(n) && /NVDA · 12 shares/.test(n), n.slice(0, 80)));
  cases.push(check("NVDA card: value and week change", /\$2,146\.80/.test(n) && /\+3\.4% this week/.test(n), n));
  for (const [label, verdict] of [["Price vs profit", "Cheaper than usual"], ["Growth", "Strong"], ["Health", "OK"], ["Trend", "Rising"]]) {
    cases.push(check(`NVDA card: "${label}" is labelled with its verdict "${verdict}"`, new RegExp(`${label}.{0,80}?${verdict}`).test(n), n));
  }
  cases.push(check("NVDA card: the plain line is underneath", /A fast-growing company/.test(n), n));

  // Every bar group on the phone list is inside a labelled cell (dt + dd).
  const barGroups = [...phone.matchAll(/<span class="flex items-center gap-\[2px\]"/g)].length;
  const labelledCells = [...phone.matchAll(/<dt\b[^>]*>[^<]+<\/dt><dd\b/g)].length;
  cases.push(check("no bar without a label: every bar group sits in a labelled cell", barGroups > 0 && barGroups === labelledCells, `${barGroups} bar groups, ${labelledCells} labelled cells`));

  cases.push(check("BTC card: only Trend is shown", /Trend/.test(b) && !/Price vs profit|Growth|Health/.test(b), b));
  cases.push(check("BTC card: says why - 'No company behind it, so only the price trend is rated'", /No company behind it, so only the price trend is rated\./.test(b), b));
  cases.push(check("BTC card: trend verdict shown", /Trend.{0,80}?Falling/.test(b), b));
  cases.push(check("BTC card: a loss is shown as a loss (minus sign)", /−1\.2% this week/.test(b), b));

  // The desktop table is unchanged: its header row still names every column.
  const table = html.match(/<table[\s\S]*?<\/table>/)?.[0] ?? "";
  cases.push(check("desktop table keeps its column headers", ["Holding", "Value", "This week", "Price", "Growth", "Health", "Trend"].every((h) => text(table).includes(h)), text(table).slice(0, 120)));

  return { suiteName: "Phone holdings cards (every bar labelled)", gating: true, cases };
}

async function main() {
  const suite = runMobileHoldingsSuite();
  console.log(`Report written to ${writeReport([suite])}`);
  const failed = suite.cases.filter((c) => c.status === "fail");
  for (const c of failed) console.log(`FAIL: ${c.name} - ${c.detail}`);
  console.log(`${suite.cases.length - failed.length}/${suite.cases.length} passed.`);
  if (failed.length > 0) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
