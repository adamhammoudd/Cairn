// feat/framework-in-assistant: the daily briefing's one-line note on a holding,
// shown only when a new filing moved "Use of cash" or the business
// description, and silent otherwise.
//
// Run: npx tsx --conditions=react-server scripts/tests/briefing-filing-line.ts

import { pathToFileURL } from "node:url";
import { buildBriefing, filingChangeLine, NEW_FILING_DAYS, type WeekAgoLevels } from "@/lib/daily-briefing";
import type { Dimension, Scorecard } from "@/lib/scorecard";
import { checkScopeGuard } from "@/lib/ai/scope-guard";
import { writeReport, type SuiteResult, type TestCase } from "./report";

const TODAY = "2026-10-01";

const capital = (level: Dimension["level"], verdict: string): Dimension => ({
  key: "capital",
  label: "Use of cash",
  level,
  rated: true,
  verdict,
  sentence: "",
  inputs: [],
  sources: [
    { kind: "sec_filing", label: "10-K filed 2026-02-25 (cash flow and share count, fiscal 2024 to 2026)", ref: "a" },
    { kind: "sec_filing", label: "10-Q filed 2026-09-28 (debt at the end of fiscal 2026)", ref: "b" },
  ],
});
/** A card with the four dimensions the briefing's bars always read, plus `dims`. */
const card = (dims: Dimension[]): Scorecard => ({
  symbol: "NVDA",
  asOf: TODAY,
  dimensions: [
    ...(["valuation", "growth", "health", "trend"] as const).map((key): Dimension => ({ key, label: key, level: "not_applicable", rated: true, verdict: "Not available", sentence: "", inputs: [], sources: [] })),
    ...dims,
  ],
});
const weekAgo = (levels: WeekAgoLevels["levels"]): WeekAgoLevels => ({ asOf: "2026-09-24", levels });

export function runBriefingFilingLineSuite(): SuiteResult {
  const cases: TestCase[] = [];
  const check = (name: string, ok: boolean, detail: string) => cases.push({ name, status: ok ? "pass" : "fail", detail });

  const strong = card([capital("strong", "Strong")]);
  check("Nothing changed and no new 10-K: no line", filingChangeLine(strong, weekAgo({ capital: { level: "strong", verdict: "Strong" } }), { form: "10-K", filed: "2026-02-25" }, TODAY) === null, "null");
  check("No card a week ago to compare with: no line", filingChangeLine(strong, null, null, TODAY) === null, "null");
  const moved = filingChangeLine(strong, weekAgo({ capital: { level: "mixed", verdict: "Mixed" } }), null, TODAY);
  check("Use of cash moved: one line naming both verdicts and the newest filing", moved === "Use of cash now reads Strong (was Mixed) after its 10-Q filed Mon 28 Sep.", String(moved));
  check(
    "A level that was 'not applicable' a week ago is not a change",
    filingChangeLine(strong, weekAgo({ capital: { level: "not_applicable", verdict: "Not available" } }), null, TODAY) === null,
    "null",
  );
  const fresh = filingChangeLine(strong, null, { form: "10-K", filed: "2026-09-26" }, TODAY);
  check("A 10-K filed in the last week: one line", fresh === "What it does and its revenue split were re-read from its new 10-K, filed Sat 26 Sep.", String(fresh));
  const edge = new Date(Date.parse(`${TODAY}T00:00:00Z`) - NEW_FILING_DAYS * 86_400_000).toISOString().slice(0, 10);
  const older = new Date(Date.parse(`${TODAY}T00:00:00Z`) - (NEW_FILING_DAYS + 1) * 86_400_000).toISOString().slice(0, 10);
  check(`Filed exactly ${NEW_FILING_DAYS} days ago still counts; a day older does not`, filingChangeLine(strong, null, { form: "10-K", filed: edge }, TODAY) !== null && filingChangeLine(strong, null, { form: "10-K", filed: older }, TODAY) === null, `${edge} / ${older}`);
  const both = filingChangeLine(strong, weekAgo({ capital: { level: "weak", verdict: "Weak" } }), { form: "10-K", filed: "2026-09-30" }, TODAY);
  check("Both at once: still one line", !!both && !both.includes("\n") && /Use of cash now reads Strong \(was Weak\)/.test(both) && /re-read from its new 10-K/.test(both), String(both));
  check("The line describes, never advises (scope guard)", [moved, fresh, both].every((l) => l && checkScopeGuard(l).passed), "3 lines");

  const b = buildBriefing({
    today: TODAY,
    exposureEnabled: false,
    holdings: [
      {
        symbol: "NVDA",
        name: "NVIDIA",
        assetType: "equity",
        quantity: 1,
        value: 100,
        pricesAsc: [],
        scorecard: card([capital("strong", "Strong")]),
        scorecardWeekAgo: weekAgo({ capital: { level: "mixed", verdict: "Mixed" } }),
        reactions: [],
        dividends: null,
        events: [],
        business: { form: "10-K", filed: "2026-02-25" },
      },
      {
        symbol: "BTC",
        name: "Bitcoin",
        assetType: "crypto",
        quantity: 1,
        value: 100,
        pricesAsc: [],
        scorecard: card([]),
        scorecardWeekAgo: null,
        reactions: [],
        dividends: null,
        events: [],
      },
    ],
  });
  const nvda = b.holdings.find((h) => h.symbol === "NVDA");
  const btc = b.holdings.find((h) => h.symbol === "BTC");
  check("The holding row carries the note", nvda?.filingNote === "Use of cash now reads Strong (was Mixed) after its 10-Q filed Mon 28 Sep.", String(nvda?.filingNote));
  check("A coin has no filings: no note", btc?.filingNote === null, String(btc?.filingNote));

  return { suiteName: "Briefing: one line when a new filing moved use of cash or the business", gating: true, cases };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const r = runBriefingFilingLineSuite();
  for (const c of r.cases) console.log(`${c.status === "pass" ? "PASS" : "FAIL"} ${c.name} - ${c.detail}`);
  const passed = r.cases.filter((c) => c.status === "pass").length;
  console.log(`${passed}/${r.cases.length} passed.`);
  writeReport([r]);
  process.exit(passed === r.cases.length ? 0 : 1);
}
