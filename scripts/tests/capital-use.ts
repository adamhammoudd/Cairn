// feat/scorecard-capital-use: the "Use of cash" scorecard dimension.
//
// Parser checks run on real SEC companyfacts, trimmed to the concepts the
// parser reads (scripts/tests/fixtures/sec-capital, fetched 2026-10-01,
// values unmodified):
//   NVDA - buys back shares, 10-for-1 split in June 2024 (inside the window)
//   AAPL - large buybacks; acquisitions have no standard tag since 2023
//   TSLA - no buybacks and no dividends reported at all
//   KO   - dividends; switched debt tags in 2024
//   MU   - buybacks while three-year free cash flow was negative and debt rose
// Verdict boundaries use synthetic rows, one threshold at a time.
//
// Run: npx tsx --conditions=react-server scripts/tests/capital-use.ts

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseCompanyFacts, secHistoryRows, type CompanyFacts, type ParsedCompany } from "../../supabase/functions/_shared/sec-companyfacts";
import { capitalUse, sortQuarters, type AnnualCapitalRow } from "@/lib/fundamentals";
import {
  THRESHOLDS,
  buildScorecard,
  capitalDimension,
  capitalInputFromRows,
  capitalLevel,
  type Dimension,
  type Scorecard,
  type StoredAnnualRow,
  type StoredQuarterRow,
} from "@/lib/scorecard";
import { checkScopeGuard } from "@/lib/ai/scope-guard";
import { checkSummaryText, sentences, unexplainedJargon, wordCount, MAX_SENTENCE_WORDS } from "@/lib/ai/plain-summary";
import { allowedNumbers, unsourcedNumbers } from "@/lib/ai/assistant/guards";
import { buildBriefing } from "@/lib/daily-briefing";
import { renderComponentText } from "./render-helper";
import { writeReport, type SuiteResult, type TestCase } from "./report";

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(here, "fixtures", "sec-capital");

function load(symbol: string): { parsed: ParsedCompany; dim: Dimension; input: ReturnType<typeof capitalInputFromRows> } {
  const doc = JSON.parse(fs.readFileSync(path.join(FIXTURES, `${symbol}.json`), "utf8")) as { companyfacts: CompanyFacts };
  const parsed = parseCompanyFacts(doc.companyfacts);
  const rows = secHistoryRows(symbol, parsed.cik, parsed, [], "2026-10-01T00:00:00Z");
  // As loadScorecard reads them: the newest 28 quarters, every annual row.
  const quarters = sortQuarters(rows.quarters as unknown as StoredQuarterRow[]).slice(0, 28);
  const input = capitalInputFromRows(rows.annual as unknown as StoredAnnualRow[], quarters);
  return { parsed, dim: capitalDimension(input), input };
}

const annualOf = (p: ParsedCompany, fy: number) => p.annual.find((a) => a.fiscal_year === fy);
const near = (a: number | null | undefined, b: number, tol = 0.005) => typeof a === "number" && Math.abs(a - b) <= tol;
const display = (d: Dimension, label: string) => d.inputs.find((i) => i.label.startsWith(label))?.display ?? null;

// Synthetic three years: free cash flow 100/110/121, shares 100 -> 100, debt 50 -> 50.
function years(over: Partial<Record<"sharesLast" | "fcfLast" | "buybacks" | "dividends" | "acquisitions", number | null>> = {}): AnnualCapitalRow[] {
  const base = (fy: number, fcf: number, shares: number): AnnualCapitalRow => ({
    fiscal_year: fy,
    period_end: `${fy}-12-31`,
    revenue: 1000,
    operating_cash_flow: fcf + 10,
    capex: 10,
    dividends_paid: over.dividends === undefined ? 10 : over.dividends,
    buybacks: over.buybacks === undefined ? 20 : over.buybacks,
    acquisitions: over.acquisitions === undefined ? 0 : over.acquisitions,
    research_development: 50,
    stock_compensation: 5,
    diluted_shares: shares,
  });
  return [base(2023, 100, 100), base(2024, 110, 100), base(2025, over.fcfLast ?? 121, over.sharesLast ?? 100)];
}
const debt = (start: number | null, end: number | null) => new Map<number, number | null>([[2022, start], [2025, end]]);

export function runCapitalUseSuite(): SuiteResult {
  const cases: TestCase[] = [];
  const check = (name: string, ok: boolean, detail: string) => cases.push({ name, status: ok ? "pass" : "fail", detail });

  const NVDA = load("NVDA");
  const AAPL = load("AAPL");
  const TSLA = load("TSLA");
  const KO = load("KO");
  const MU = load("MU");

  // ------------------------------------------------------------ the parser
  {
    const a = annualOf(NVDA.parsed, 2026)!;
    check(
      "NVDA FY2026 buybacks are the 10-K's PaymentsForRepurchaseOfCommonStock, cited to the 10-K",
      a.values.buybacks === 40_086_000_000 && a.provenance.buybacks?.concept === "PaymentsForRepurchaseOfCommonStock" && a.provenance.buybacks?.form === "10-K",
      `${a.values.buybacks} ${JSON.stringify(a.provenance.buybacks)}`,
    );
    const shares = NVDA.parsed.annual.filter((y) => y.values.diluted_shares != null).map((y) => [y.fiscal_year, y.values.diluted_shares!] as const);
    check(
      "NVDA diluted share counts are all on the post-split basis (10-for-1 in June 2024): every year above 20 billion",
      shares.length >= 6 && shares.every(([, v]) => v > 20e9 && v < 30e9),
      shares.map(([fy, v]) => `${fy}:${(v / 1e6).toFixed(0)}M`).join(" "),
    );
    check(
      "NVDA FY2024 shares (first filed pre-split as ~2.49B) read 24,940M",
      near(annualOf(NVDA.parsed, 2024)!.values.diluted_shares! / 1e6, 24_940, 1),
      String(annualOf(NVDA.parsed, 2024)!.values.diluted_shares),
    );
    const derived = [NVDA, AAPL, KO].flatMap((c) => c.parsed.quarters).filter((q) => q.provenance.diluted_shares && q.provenance.diluted_shares.method !== "reported");
    check("A weighted-average share count is never differenced or derived into a quarter", derived.length === 0, `${derived.length} derived`);
    const q4 = NVDA.parsed.quarters.filter((q) => q.fiscal_quarter === 4);
    check("No Q4 share count is invented from the year (10-Ks report no 3-month Q4 count)", q4.every((q) => q.values.diluted_shares === null), q4.map((q) => q.values.diluted_shares).join(","));
    check(
      "TSLA: no buybacks and no dividends are stored as null (not reported), never 0",
      TSLA.parsed.annual.every((y) => y.values.buybacks === undefined || y.values.buybacks === null) &&
        TSLA.parsed.annual.every((y) => y.values.dividends_paid === undefined || y.values.dividends_paid === null),
      JSON.stringify(TSLA.parsed.annual.slice(-3).map((y) => [y.values.buybacks ?? null, y.values.dividends_paid ?? null])),
    );
    check(
      "AAPL: acquisitions since FY2023 have no standard tag and stay null, not 0",
      [2023, 2024, 2025].every((fy) => annualOf(AAPL.parsed, fy)!.values.acquisitions == null),
      [2023, 2024, 2025].map((fy) => String(annualOf(AAPL.parsed, fy)!.values.acquisitions)).join(","),
    );
    const koEnd = KO.input.use!;
    check(
      "KO: debt after its 2024 switch to the ...AndCapitalLeaseObligations tags reads ~$45B, not commercial paper alone",
      koEnd.debtEnd !== null && koEnd.debtEnd > 40e9 && koEnd.debtEnd < 50e9,
      String(koEnd.debtEnd),
    );
    check(
      "NVDA: the buyback authorisation left is a filed figure with its 10-Q cited",
      NVDA.input.plan?.buybackRemaining?.value === 99_300_000_000 && NVDA.input.plan?.buybackRemaining?.source.label.startsWith("10-Q"),
      JSON.stringify(NVDA.input.plan?.buybackRemaining),
    );
    check("AAPL: no tagged buyback authorisation, so none is shown", AAPL.input.plan?.buybackRemaining === null, JSON.stringify(AAPL.input.plan));
  }

  // ----------------------------------------------- the arithmetic, real filings
  {
    const c = NVDA.input.use!;
    check("NVDA window is fiscal 2024 to 2026", c.firstYear === 2024 && c.lastYear === 2026, `${c.firstYear}-${c.lastYear}`);
    check(
      "NVDA free cash flow over 3 years = (28.09-1.07)+(64.09-3.24)+(102.72-6.04) = $184.6B",
      near(c.freeCashFlow / 1e9, 184.55, 0.01),
      String(c.freeCashFlow),
    );
    check("NVDA buybacks 83.33B / 184.55B = 45%", near(c.buybacksShare, 83.33 / 184.55, 0.001), String(c.buybacksShare));
    check("NVDA share count 24,514M vs 24,940M = -1.7% (split year inside the window)", near(c.shareChange, 24_514 / 24_940 - 1, 0.0005), String(c.shareChange));
    check("NVDA free cash flow per share $1.08 -> $3.94 = +264%", near(c.fcfPerShareChange, 2.64, 0.01) && near(c.fcfPerShareFirst, 1.083, 0.001), `${c.fcfPerShareFirst} -> ${c.fcfPerShareLast}`);
    check("NVDA verdict: Strong (per-share cash up, shares down, debt down)", NVDA.dim.verdict === "Strong" && NVDA.dim.level === "strong", NVDA.dim.verdict);
    check(
      "NVDA sentence",
      NVDA.dim.sentence ===
        "In fiscal 2024 to 2026 it used 45% of its spare cash on buying back shares, 1% on dividends and 1% on buying companies. The other 52% was left over. The share count fell 2%, and spare cash per share rose 264%. Its debt fell 23%.",
      NVDA.dim.sentence,
    );
    check(
      "AAPL: buybacks 86% and dividends 15% of spare cash; no left-over figure while acquisitions are not reported",
      /86% of its spare cash on buying back shares and 15% on dividends/.test(AAPL.dim.sentence) && AAPL.input.use!.leftOver === null && /no standard figure for buying companies/.test(AAPL.dim.sentence),
      AAPL.dim.sentence,
    );
    check(
      "MU: buybacks while free cash flow over the 3 years was negative - stated, not hidden",
      MU.input.use!.freeCashFlow < 0 && (MU.input.use!.buybacks ?? 0) > 0 && /spent more cash than it brought in/.test(MU.dim.sentence) && MU.dim.level !== "strong",
      `${MU.dim.verdict}: ${MU.dim.sentence}`,
    );
    check(
      "KO: dividends above its spare cash (127%) are shown as they are",
      /127% on dividends/.test(KO.dim.sentence),
      KO.dim.sentence,
    );
  }

  // ------------------------------------------------------ verdict boundaries
  {
    const T = THRESHOLDS.capital;
    const lvl = (rows: AnnualCapitalRow[], d = debt(50, 50)) => capitalLevel(capitalUse(rows, d)!);
    check("Strong: per-share cash up, shares flat, debt flat", lvl(years()) === "strong", String(lvl(years())));
    check(`Shares up just inside ${T.flatShares * 100}% still count as flat -> Strong`, lvl(years({ sharesLast: 100.9 })) === "strong", String(lvl(years({ sharesLast: 100.9 }))));
    check(`Shares up just over ${T.flatShares * 100}% -> Mixed`, lvl(years({ sharesLast: 101.1 })) === "mixed", String(lvl(years({ sharesLast: 101.1 }))));
    check(`Shares up just over ${T.dilution * 100}% (dilution), per-share cash still up -> Mixed`, lvl(years({ sharesLast: 103.1, fcfLast: 140 })) === "mixed", String(lvl(years({ sharesLast: 103.1, fcfLast: 140 }))));
    check(`Debt up just inside ${T.flatDebt * 100}% -> Strong`, lvl(years(), debt(50, 52.4)) === "strong", String(lvl(years(), debt(50, 52.4))));
    check(`Debt up just over ${T.flatDebt * 100}% -> Mixed`, lvl(years(), debt(50, 52.6)) === "mixed", String(lvl(years(), debt(50, 52.6))));
    check("Debt not reported at either end: never Strong", lvl(years(), debt(null, 50)) === "mixed", String(lvl(years(), debt(null, 50))));
    check("No debt at either end counts as flat -> Strong", lvl(years(), debt(0, 0)) === "strong", String(lvl(years(), debt(0, 0))));
    check("Buybacks above three years' free cash flow (paid from savings or borrowing) -> Mixed", lvl(years({ buybacks: 120 })) === "mixed", String(lvl(years({ buybacks: 120 }))));
    check("Per-share cash down while cash went to buybacks/dividends -> Weak", lvl(years({ fcfLast: 90 })) === "weak", String(lvl(years({ fcfLast: 90 }))));
    check(
      "Per-share cash down with no reported spending -> Mixed, not Weak",
      lvl(years({ fcfLast: 90, buybacks: 0, dividends: 0, acquisitions: 0 })) === "mixed",
      String(lvl(years({ fcfLast: 90, buybacks: 0, dividends: 0, acquisitions: 0 }))),
    );
    const noShares = years();
    noShares[0] = { ...noShares[0], diluted_shares: null };
    const na = capitalDimension({ use: capitalUse(noShares, debt(50, 50)), sources: [], plan: null });
    check("Share count missing at one end: Not enough data, not a guess", na.level === "not_applicable" && na.verdict === "Not enough data", `${na.verdict}: ${na.sentence}`);
    const two = years().slice(1);
    check("Fewer than three fiscal years: no dimension figures at all", capitalUse(two, debt(50, 50)) === null, "null");
    const gap = years();
    gap[1] = { ...gap[1], fiscal_year: 2021 };
    check("A missing year inside the window is not bridged", capitalUse(gap, debt(50, 50)) === null, "null");
  }

  // ------------------------------------------- "not reported" is never zero
  {
    const t = TSLA.dim;
    check(
      'TSLA inputs: buybacks and dividends read "not reported", never "$0"',
      display(t, "Share buybacks (USD)") === "not reported" && display(t, "Dividends paid (USD)") === "not reported",
      `${display(t, "Share buybacks (USD)")} / ${display(t, "Dividends paid (USD)")}`,
    );
    check("TSLA sentence names what its filings don't report instead of a 0%", /no standard figure for buying back shares and dividends/.test(t.sentence) && !/\b0%/.test(t.sentence), t.sentence);
    check('TSLA: "Buybacks ÷ free cash flow" has no value rather than 0%', display(t, "Share buybacks ÷") === null, String(display(t, "Share buybacks ÷")));
    const html = renderComponentText("src/components/analysis/summary-sections.tsx", "DimensionDetail", { d: t });
    check('The Full breakdown row renders "not reported" for TSLA\'s buybacks', /Share buybacks \(USD\)\s*not reported/.test(html) && !/Share buybacks \(USD\)\s*\$0/.test(html), html.slice(0, 200));
    const aaplHtml = renderComponentText("src/components/analysis/summary-sections.tsx", "DimensionDetail", { d: AAPL.dim });
    check("The breakdown links every filing behind the figures", AAPL.dim.sources.length > 0 && AAPL.dim.sources.every((s) => s.url?.startsWith("https://www.sec.gov/Archives/") && aaplHtml.includes(s.label)), AAPL.dim.sources.map((s) => s.label).join(" | "));
    const nvdaHtml = renderComponentText("src/components/analysis/summary-sections.tsx", "DimensionDetail", { d: NVDA.dim });
    check("NVDA breakdown shows its filed plan under its own heading", /What the company has filed about next/.test(nvdaHtml) && /\$99\.3B/.test(nvdaHtml), nvdaHtml.slice(-300));
  }

  // ------------------------------------------- wording, guards, applicability
  {
    const all = [NVDA, AAPL, TSLA, KO, MU].map((c) => c.dim);
    const long = all.flatMap((d) => sentences(d.sentence)).filter((s) => wordCount(s) > MAX_SENTENCE_WORDS);
    check(`Every sentence is at most ${MAX_SENTENCE_WORDS} words (the plain summary may quote it)`, long.length === 0, long.join(" | "));
    const jargon = all.map((d) => unexplainedJargon(d.sentence)).filter(Boolean);
    check("No unexplained finance jargon in the sentences", jargon.length === 0, jargon.join(", "));
    const guard = all.map((d) => checkScopeGuard(`${d.verdict}. ${d.sentence}`)).filter((g) => !g.passed);
    check("Every verdict and sentence passes the scope guard (no buy/hold/sell, no advice)", guard.length === 0, JSON.stringify(guard));
    check(
      "No wording judges management or tells anyone what to do",
      all.every((d) => !/\b(?:good|bad|great|poor|wise|smart)\b.*\bmanagement\b|\bmanagement is\b|\bshould\b|\bskip\b|\bgood investment\b/i.test(`${d.verdict} ${d.sentence}`)),
      "checked 5 companies",
    );

    const card = (dim: Dimension): Scorecard => ({ symbol: "NVDA", asOf: "2026-10-01", dimensions: [dim] });
    const inputs = { name: "NVIDIA", symbol: "NVDA", assetType: "equity", scorecard: card(NVDA.dim), history: null };
    const quoted = checkSummaryText({ headline: "NVIDIA's spare cash per share rose 264% in fiscal 2024 to 2026.", bullets: ["It used 45% of its spare cash on buying back shares.", "The share count fell 2%.", "Its debt fell 23%."] }, inputs);
    check("Plain-summary guard accepts the new figures", quoted.passed, JSON.stringify(quoted));
    const invented = checkSummaryText({ headline: "NVIDIA's spare cash per share rose 264% in fiscal 2024 to 2026.", bullets: ["It used 60% of its spare cash on buying back shares.", "The share count fell 2%.", "Its debt fell 23%."] }, inputs);
    check("Plain-summary guard rejects an invented one (60%)", !invented.passed && invented.reason === "number_not_in_inputs", JSON.stringify(invented));

    const outcome = {
      ok: true as const,
      label: "NVDA scorecard",
      data: { scores: [{ part: NVDA.dim.label, in_words: NVDA.dim.sentence, figures: NVDA.dim.inputs.filter((i) => i.display).map((i) => ({ label: i.label, value: i.display })) }] },
      sources: [],
      facts: [],
      tiles: [],
    };
    const allowed = allowedNumbers([outcome as never]);
    check("Assistant figure guard accepts $99.3B, 45% and +264% from the tool result", unsourcedNumbers("Buybacks took 45% of free cash flow, $99.3B is still authorised, and cash per share rose +264%.", allowed).length === 0, [...allowed].slice(0, 12).join(","));
    check("Assistant figure guard rejects an invented 58%", unsourcedNumbers("Buybacks took 58% of free cash flow.", allowed).join() === "58%", unsourcedNumbers("Buybacks took 58% of free cash flow.", allowed).join());

    const base = {
      symbol: "BTC",
      today: "2026-10-01",
      metrics: null,
      valuation: { pe: null, sector: null, fcfYield: null, priceDate: null, filing: null },
      dividend: { perShareTtm: null, price: null, payoutOfFcf: null, freeCashFlow: null, growthYears: null, filing: null },
      trend: { return6m: null, vs200d: null, asOf: null },
      events: [],
      reactions: [],
      filing: null,
    };
    for (const [assetType, why] of [["crypto", "no company behind it"], ["etf", "A fund holds many companies"]] as const) {
      const sc = buildScorecard({ ...base, assetType, companyData: "not_applicable" });
      const cap = sc.dimensions.find((d) => d.key === "capital")!;
      check(`${assetType}: "Use of cash" is Not applicable, like the other company dimensions`, cap.level === "not_applicable" && cap.verdict === "Not applicable" && cap.sentence.includes(why), `${cap.verdict}: ${cap.sentence}`);
    }
    const order = buildScorecard({ ...base, symbol: "NVDA", assetType: "equity", companyData: "available", capital: NVDA.input }).dimensions.map((d) => d.key);
    check("Card order: the company dimensions, then Use of cash, then trend and next event", order.join(",") === "valuation,growth,health,dividend,capital,trend,next_event", order.join(","));

    const scorecard = buildScorecard({ ...base, symbol: "NVDA", assetType: "equity", companyData: "available", capital: NVDA.input });
    const b = buildBriefing({
      today: "2026-10-01",
      exposureEnabled: false,
      holdings: [{ symbol: "NVDA", name: "NVIDIA", assetType: "equity", quantity: 1, value: 100, pricesAsc: [], scorecard, scorecardWeekAgo: null, reactions: [], dividends: null, events: [] }],
    });
    const keys = b.holdings[0]?.bars.map((x) => x.key) ?? [];
    check('Mobile "Holdings at a glance" keeps four rated bars, no "Use of cash"', keys.join(",") === "valuation,growth,health,trend", keys.join(","));
  }

  return { suiteName: "Use of cash (capital-use dimension, real SEC fixtures)", gating: true, cases };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const r = runCapitalUseSuite();
  for (const c of r.cases) console.log(`${c.status === "pass" ? "PASS" : "FAIL"} ${c.name} - ${c.detail}`);
  const passed = r.cases.filter((c) => c.status === "pass").length;
  console.log(`${passed}/${r.cases.length} passed.`);
  writeReport([r]);
  process.exit(passed === r.cases.length ? 0 : 1);
}
