// feat/peer-comparison: the "vs similar companies" row, EV ÷ EBITDA and
// debt ÷ equity as secondary inputs, and the plain sentence when the share's
// own history and its peers disagree. The verdict is unchanged: it stays the
// share against its own 5-year history.
//
// Run: npx tsx --conditions=react-server scripts/tests/peer-comparison.ts

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseCompanyFacts, type CompanyFacts } from "../../supabase/functions/_shared/sec-companyfacts";
import { companyMetrics, enterpriseValue, type PeHistory, type Quarter } from "@/lib/fundamentals";
import {
  THRESHOLDS,
  VALUATION_VERDICTS,
  disagreement,
  healthDimension,
  peerComparison,
  sectorMedianPe,
  valuationDimension,
  type ValuationInput,
} from "@/lib/scorecard";
import { checkScopeGuard } from "@/lib/ai/scope-guard";
import { sentences, wordCount, MAX_SENTENCE_WORDS } from "@/lib/ai/plain-summary";
import { renderComponentText } from "./render-helper";
import { writeReport, type SuiteResult, type TestCase } from "./report";

const here = path.dirname(fileURLToPath(import.meta.url));

const pe = (current: number, avg: number | null): PeHistory => ({
  points: [],
  fiveYearAverage: avg,
  count: avg === null ? 0 : 20,
  current: { period_end: "2026-07-26", price: current, eps: 1, pe: current },
});
const val = (over: Partial<ValuationInput> = {}): ValuationInput => ({
  pe: pe(28, 61),
  sector: null,
  market: null,
  fcfYield: null,
  priceDate: "2026-09-30",
  filing: { accn: "0001045810-26-000075", form: "10-Q", filed: "2026-08-26", cik: "0001045810" },
  ...over,
});
const sector5 = { median: 20, peers: 5, name: "Semiconductors & Related Devices" };
const market = { median: 24, companies: 25 };

function quarter(fy: number, q: 1 | 2 | 3 | 4, over: Partial<Quarter> = {}): Quarter {
  const month = q * 3;
  return {
    fiscal_year: fy,
    fiscal_quarter: q,
    period_end: `${fy}-${String(month).padStart(2, "0")}-28`,
    revenue: 100,
    net_income: 20,
    operating_income: 30,
    depreciation_amortization: 5,
    operating_cash_flow: 30,
    capex: 5,
    dividends_paid: null,
    eps_diluted: 1,
    dividends_per_share: null,
    cash: 50,
    long_term_debt: 200,
    long_term_debt_noncurrent: null,
    long_term_debt_current: null,
    debt_current: null,
    short_term_borrowings: null,
    stockholders_equity: 400,
    ...over,
  };
}
const year = (over: Partial<Quarter> = {}) => [1, 2, 3, 4].map((q) => quarter(2025, q as 1 | 2 | 3 | 4, over));

export function runPeerComparisonSuite(): SuiteResult {
  const cases: TestCase[] = [];
  const check = (name: string, ok: boolean, detail: string) => cases.push({ name, status: ok ? "pass" : "fail", detail });

  // ------------------------------------------------------- median thresholds
  {
    const four = sectorMedianPe([10, 20, 30, 40]);
    const five = sectorMedianPe([10, 20, 30, 40, 50]);
    check(`Sector median needs ${THRESHOLDS.valuation.minSectorPeers} profitable peers: 4 -> none`, four === null, JSON.stringify(four));
    check("5 peers -> median 30 from 5", five?.median === 30 && five.peers === 5, JSON.stringify(five));
    check("Loss-makers and missing P/Es don't count as peers", sectorMedianPe([10, 20, 30, 40, -5, null, 0]) === null, "4 valid of 7");
  }

  // ------------------------------------------------------------- the row
  {
    const both = valuationDimension(val({ sector: sector5, market }));
    check("Row shows the company, the sector median with its count, and the market median with its count", both.peers?.pe === "28" && both.peers.sector?.median === "20" && both.peers.sector.peers === 5 && both.peers.market?.companies === 25, JSON.stringify(both.peers));
    const fewPeers = valuationDimension(val({ sector: { ...sector5, peers: 4 }, market }));
    check("A sector with too few peers is left out of the row; the market still shows", fewPeers.peers?.sector === null && fewPeers.peers?.market?.median === "24", JSON.stringify(fewPeers.peers));
    const none = valuationDimension(val({ sector: { ...sector5, peers: 4 }, market: { median: 24, companies: 9 } }));
    check("Neither comparison meets its minimum: no row at all", none.peers === undefined, JSON.stringify(none.peers));
    const noProfit = valuationDimension(val({ pe: { points: [], fiveYearAverage: null, count: 0, current: null }, fcfYield: 0.03, sector: sector5, market }));
    check("No profit (cash-yield verdict): no price-vs-profit row", noProfit.peers === undefined, noProfit.verdict);
  }

  // ------------------------------------------------------- disagreement
  {
    const d = valuationDimension(val({ sector: sector5, market }));
    check("Cheaper than its own history but pricier than similar companies: the verdict stays the history one", d.verdict === VALUATION_VERDICTS.cheaper, d.verdict);
    check("…and the sentence says so plainly", /So it is cheaper than its own history, but pricier than similar companies\./.test(d.sentence), d.sentence);
    const viaMarket = valuationDimension(val({ market }));
    check("Without enough similar companies the tracked market is used, and named", /but pricier than the companies Cairn tracks\./.test(viaMarket.sentence), viaMarket.sentence);
    const pricier = disagreement(80 / 61, 80, { median: 100 }, null);
    check("Pricier than its history but cheaper than peers", pricier === " So it is pricier than its own history, but cheaper than similar companies.", pricier);
    check("When they agree, nothing is added", disagreement(28 / 61, 28, { median: 40 }, null) === "" && disagreement(1, 30, { median: 30 }, null) === "", "agree");
    check(
      "The disagreement sentence is short, plain and passes the scope guard",
      sentences(d.sentence).every((s) => wordCount(s) <= MAX_SENTENCE_WORDS) && checkScopeGuard(d.sentence).passed,
      sentences(d.sentence).map(wordCount).join(","),
    );
  }

  // ------------------------------------------------------------- EV math
  {
    check("Enterprise value = market value + debt - cash: 1,000 + 200 = 1,200", enterpriseValue(1000, 200) === 1200, String(enterpriseValue(1000, 200)));
    check("More cash than debt lowers it: 1,000 - 300 = 700", enterpriseValue(1000, -300) === 700, String(enterpriseValue(1000, -300)));
    check("No market value or no net debt: no enterprise value", enterpriseValue(null, 200) === null && enterpriseValue(1000, null) === null, "null");
    const d = valuationDimension(val({ ev: { enterpriseValue: 4_500_000_000_000, marketCap: 4_545_000_000_000, netDebt: -45_000_000_000, ebitda: 150_000_000_000, sharesAsOf: "2026-08-20" } }));
    const evInput = d.inputs.find((i) => i.label.startsWith("Enterprise value ÷ EBITDA"));
    check("EV ÷ EBITDA = 4,500B / 150B = 30.0, shown as a secondary input", evInput?.display === "30.0", JSON.stringify(evInput));
    check("…with how it was computed as a source", d.sources.some((s) => s.kind === "computed" && /shares × latest price \+ debt − cash/.test(s.label)), d.sources.map((s) => s.label).join(" | "));
    check("…and it never changes the verdict", d.verdict === valuationDimension(val()).verdict, d.verdict);
    const negEbitda = valuationDimension(val({ ev: { enterpriseValue: 100, marketCap: 100, netDebt: 0, ebitda: -5, sharesAsOf: null } }));
    check("No EV ÷ EBITDA when EBITDA is not positive", !negEbitda.inputs.some((i) => i.label.startsWith("Enterprise value")), "absent");
  }

  // ------------------------------------------------- measured differences
  {
    const company = { revenueGrowth: 0.56, ebitdaMargin: 0.62, netDebtToEbitda: -0.4 };
    const peers5 = { revenueGrowth: 0.12, ebitdaMargin: 0.31, netDebtToEbitda: 0.8, peers: 5 };
    const p = peerComparison(28, sector5, market, company, peers5)!;
    check("Differences are listed as the company's figure vs the peer median", p.differences.map((x) => `${x.company} vs ${x.peers}`).join("; ") === "+56% vs +12%; 62% vs 31%; -0.4 vs 0.8", p.differences.map((x) => `${x.label}: ${x.company} vs ${x.peers}`).join("; "));
    check("Each difference's label explains its term", p.differences.every((x) => /\(/.test(x.label) || /^Sales growth/.test(x.label)), p.differences.map((x) => x.label).join(" | "));
    check("Facts only: no cause, no 'because', no 'deserves'", p.differences.every((x) => !/because|due to|deserv|justif|reason/i.test(`${x.label} ${x.company} ${x.peers}`)), "checked");
    check("Peer metrics from fewer than 5 companies: no differences", peerComparison(28, sector5, market, company, { ...peers5, peers: 4 })!.differences.length === 0, "none");
    check("Only against sector peers, never the whole market", peerComparison(28, null, market, company, peers5)!.differences.length === 0, "none");
    const partial = peerComparison(28, sector5, market, { ...company, netDebtToEbitda: null }, peers5)!;
    check("A figure missing on either side is left out, not zeroed", partial.differences.length === 2, String(partial.differences.length));
  }

  // ------------------------------------------------------------ debt ÷ equity
  {
    const rows = [...year(), ...[1, 2, 3, 4].map((q) => quarter(2024, q as 1 | 2 | 3 | 4))];
    const m = companyMetrics(rows)!;
    check("Debt ÷ equity = 200 / 400 = 0.5", m.debtToEquity === 0.5 && m.equity === 400, `${m.debtToEquity}`);
    const h = healthDimension(m, null);
    const de = h.inputs.find((i) => i.label.startsWith("Debt ÷ shareholders' equity"));
    check("Health shows it as a secondary input, display 0.5", de?.display === "0.5", JSON.stringify(de));
    const neg = companyMetrics([...year({ stockholders_equity: -50 }), ...[1, 2, 3, 4].map((q) => quarter(2024, q as 1 | 2 | 3 | 4))])!;
    const negInput = healthDimension(neg, null).inputs.find((i) => i.label.startsWith("Debt ÷ shareholders' equity"));
    check("Equity below zero: no ratio, and it says so", neg.debtToEquity === null && negInput?.display === "equity below zero", JSON.stringify(negInput));
    const noEq = companyMetrics([...year({ stockholders_equity: null }), ...[1, 2, 3, 4].map((q) => quarter(2024, q as 1 | 2 | 3 | 4))])!;
    check("Equity not reported: no ratio and no display", noEq.debtToEquity === null && healthDimension(noEq, null).inputs.find((i) => i.label.startsWith("Debt ÷"))?.display === null, "null");
    check("Debt ÷ equity is never part of the health verdict", healthDimension(m, null).verdict === healthDimension({ ...m, debtToEquity: 9 }, null).verdict, healthDimension(m, null).verdict);
  }

  // ------------------------------------------------- parser, real filing
  {
    const doc = JSON.parse(fs.readFileSync(path.join(here, "fixtures", "sec-equity", "NVDA.json"), "utf8")) as { companyfacts: CompanyFacts };
    const parsed = parseCompanyFacts(doc.companyfacts);
    const q = parsed.quarters.find((x) => x.period_end === "2026-01-25");
    check(
      "NVDA: shareholders' equity at 2026-01-25 is the filed $157,293M (latest filing)",
      q?.values.stockholders_equity === 157_293_000_000 && q?.provenance.stockholders_equity?.concept === "StockholdersEquity",
      `${q?.values.stockholders_equity} ${JSON.stringify(q?.provenance.stockholders_equity)}`,
    );
  }

  // ----------------------------------------------------------------- the UI
  {
    const d = valuationDimension(val({ sector: sector5, market }));
    const withDiff = { ...d.peers!, differences: peerComparison(28, sector5, market, { revenueGrowth: 0.56, ebitdaMargin: 0.62, netDebtToEbitda: -0.4 }, { revenueGrowth: 0.12, ebitdaMargin: 0.31, netDebtToEbitda: 0.8, peers: 5 })!.differences };
    const text = renderComponentText("src/components/analysis/summary-sections.tsx", "PeerRow", { p: withDiff });
    check("Row renders the counts that fed each median", /Similar companies, median \(5 in Semiconductors/.test(text) && /All 25 companies Cairn tracks, median\s*24/.test(text), text.slice(0, 240));
    check("Row renders the measured differences", /Sales growth, last 12 months\s*\+56% vs \+12%/.test(text), text.slice(-240));
  }

  return { suiteName: "Peer comparison (vs similar companies, EV ÷ EBITDA, debt ÷ equity)", gating: true, cases };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const r = runPeerComparisonSuite();
  for (const c of r.cases) console.log(`${c.status === "pass" ? "PASS" : "FAIL"} ${c.name} - ${c.detail}`);
  const passed = r.cases.filter((c) => c.status === "pass").length;
  console.log(`${passed}/${r.cases.length} passed.`);
  writeReport([r]);
  process.exit(passed === r.cases.length ? 0 : 1);
}
