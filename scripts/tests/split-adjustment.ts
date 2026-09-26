// Regression test for fix/split-adjusted-fundamentals.
//
// SEC companyfacts repeats a figure in every filing that shows it, and the
// parser keeps the latest-filed copy. Across a share split that mixes bases:
// NVDA's FY2024 Q1 EPS was last filed in May 2024 (0.82, before the 10-for-1
// split), while Q2, Q3 and the full year were restated after it (0.25, 0.37,
// 1.19). Q4 = FY - Q1 - Q2 - Q3 then came out at -0.25, with net income of
// $12.3bn. Those negative quarters dragged trailing EPS down, pushed NVDA's
// 5-year average P/E up to ~52, and the scorecard called the stock "Cheap".
//
// The fixtures are REAL SEC data (scripts/tests/fixtures/sec/*.json, trimmed
// to the concepts read here, values unmodified), plus NVDA's split-adjusted
// quarter-end closes as stored in Cairn. MSFT is the company with no split
// since 2003, so its figures must come through unchanged.
//
// Run: npx tsx --conditions=react-server scripts/tests/split-adjustment.ts

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseCompanyFacts, type CompanyFacts, type QuarterRow, type XbrlFact } from "../../supabase/functions/_shared/sec-companyfacts";
import { peHistory, perShare, sortQuarters, type Quarter, type PricePoint } from "@/lib/fundamentals";
import { valuationDimension } from "@/lib/scorecard";
import { writeReport, type SuiteResult, type TestCase } from "./report";

const here = path.dirname(fileURLToPath(import.meta.url));
function fixture(symbol: string): { companyfacts: CompanyFacts; quarter_end_closes?: { closes: PricePoint[] } } {
  return JSON.parse(fs.readFileSync(path.join(here, "fixtures", "sec", `${symbol}.json`), "utf8"));
}

const q = (rows: QuarterRow[], fy: number, qn: number) => rows.find((r) => r.fiscal_year === fy && r.fiscal_quarter === qn);
const near = (a: number | null | undefined, b: number, tol: number) => typeof a === "number" && Math.abs(a - b) <= tol;
const asQuarter = (r: QuarterRow): Quarter => ({ fiscal_year: r.fiscal_year, fiscal_quarter: r.fiscal_quarter, period_end: r.period_end, ...r.values });

export function runSplitAdjustmentSuite(): SuiteResult {
  const cases: TestCase[] = [];
  const check = (name: string, ok: boolean, detail: string) => cases.push({ name, status: ok ? "pass" : "fail", detail });

  // ---- NVDA: 4-for-1 (July 2021) and 10-for-1 (June 2024) ------------------------
  const nvdaFx = fixture("NVDA");
  const nvda = parseCompanyFacts(nvdaFx.companyfacts);
  const splits = nvda.splits ?? [];
  check(
    "NVDA: both splits found from SEC restatements (4-for-1 in 2021, 10-for-1 in 2024)",
    splits.some((s) => s.ratio === 4 && s.firstNewBasis.startsWith("2021")) && splits.some((s) => s.ratio === 10 && s.firstNewBasis.startsWith("2024")),
    JSON.stringify(splits),
  );

  const y24q1 = q(nvda.quarters, 2024, 1)?.values.eps_diluted;
  check("NVDA FY2024 Q1 EPS is on today's basis (0.82 filed pre-split -> 0.082)", near(y24q1, 0.082, 0.0005), `got ${y24q1}`);

  const y24q4 = q(nvda.quarters, 2024, 4);
  check(
    "NVDA FY2024 Q4 EPS is positive and ~0.49 (was -0.25 from mixed bases)",
    near(y24q4?.values.eps_diluted, 0.488, 0.01),
    `got ${y24q4?.values.eps_diluted}, net income ${y24q4?.values.net_income}`,
  );
  check(
    "NVDA FY2024 Q4 dividend per share is 0.004 (was -0.032)",
    near(y24q4?.values.dividends_per_share, 0.004, 0.0005),
    `got ${y24q4?.values.dividends_per_share}`,
  );
  const y23q4 = q(nvda.quarters, 2023, 4)?.values;
  check("NVDA FY2023 Q4 EPS is positive, ~0.05 (was -1.00)", near(y23q4?.eps_diluted, 0.053, 0.01), `got ${y23q4?.eps_diluted}`);
  check("NVDA FY2023 Q4 dividend per share is 0.004 (was -0.104)", near(y23q4?.dividends_per_share, 0.004, 0.0005), `got ${y23q4?.dividends_per_share}`);
  const y21q4 = q(nvda.quarters, 2021, 4)?.values.eps_diluted;
  check("NVDA FY2021 Q4 EPS (across the 2021 split) is positive (was -0.52)", typeof y21q4 === "number" && y21q4 > 0, `got ${y21q4}`);

  const badEps = nvda.quarters.filter((r) => (r.values.eps_diluted ?? 0) < 0 && (r.values.net_income ?? 0) > 0);
  check(
    "NVDA: no quarter has negative EPS alongside positive net income",
    badEps.length === 0,
    badEps.map((r) => `FY${r.fiscal_year}Q${r.fiscal_quarter}=${r.values.eps_diluted}`).join(", ") || "none",
  );
  const badDps = nvda.quarters.filter((r) => (r.values.dividends_per_share ?? 0) < 0);
  check("NVDA: no quarter has a negative dividend per share", badDps.length === 0, badDps.map((r) => `FY${r.fiscal_year}Q${r.fiscal_quarter}`).join(", ") || "none");

  const fy22 = nvda.annual.find((a) => a.fiscal_year === 2022)?.values.eps_diluted;
  check("NVDA FY2022 annual EPS (last filed Feb 2024, pre-split) is on today's basis: 3.85 -> 0.385", near(fy22, 0.385, 0.001), `got ${fy22}`);

  const y27q2 = q(nvda.quarters, 2027, 2)?.values.dividends_per_share;
  check(
    "NVDA FY2027 Q2 dividend stays at the 0.25 NVIDIA filed (10-Q 2026-08-26: 0.25 quarter, 0.26 six months; no split)",
    y27q2 === 0.25,
    `got ${y27q2}`,
  );

  const floatNoise = nvda.quarters.flatMap((r) =>
    (["eps_diluted", "dividends_per_share"] as const)
      .map((f) => r.values[f])
      .filter((v): v is number => v !== null && String(v).replace(/^-?\d*\.?/, "").length > 6),
  );
  check("NVDA: stored per-share figures carry no float noise (1.7600000000000002)", floatNoise.length === 0, floatNoise.join(", ") || "none");
  check("NVDA FY2026 Q4 EPS is 1.76 exactly", q(nvda.quarters, 2026, 4)?.values.eps_diluted === 1.76, `got ${q(nvda.quarters, 2026, 4)?.values.eps_diluted}`);

  // The scorecard, end to end on the real figures and stored closes.
  const quarters = sortQuarters(nvda.quarters.map(asQuarter));
  const annualEps = new Map<number, number>();
  for (const a of nvda.annual) if (typeof a.values.eps_diluted === "number") annualEps.set(a.fiscal_year, a.values.eps_diluted);
  const closes = nvdaFx.quarter_end_closes!.closes;
  const price = closes[closes.length - 1].close;
  const pe = peHistory(quarters, closes, price, annualEps);
  const points = pe.points.map((p) => `${p.period_end}:${p.pe.toFixed(1)}`).join(" ");
  const eps2024 = pe.points.find((p) => p.period_end === "2024-01-28")?.eps;
  check("NVDA trailing EPS at FY2024 year end equals the reported year (1.19)", near(eps2024, 1.19, 0.005), `got ${eps2024}`);
  const val = valuationDimension({ pe, sector: null, fcfYield: null, priceDate: closes[closes.length - 1].date, filing: null });
  check(
    "NVDA: every P/E point uses a positive, single-basis trailing EPS",
    pe.points.every((p) => p.eps > 0 && p.pe > 0 && p.pe < 400),
    points,
  );
  cases.push({
    name: "NVDA valuation (informational, for the PR): 5-year average and verdict",
    status: "pass",
    detail: `current ${pe.current?.pe.toFixed(1)}x, 5-year average ${pe.fiveYearAverage?.toFixed(1)}x over ${pe.count} quarter ends -> ${val.verdict}: ${val.sentence}`,
  });

  // ---- MSFT: no split in the fixture window ---------------------------------------
  const msftFx = fixture("MSFT");
  const msft = parseCompanyFacts(msftFx.companyfacts);
  check("MSFT: no split found", (msft.splits ?? []).length === 0, JSON.stringify(msft.splits));
  const raw = (msftFx.companyfacts.facts?.["us-gaap"]?.EarningsPerShareDiluted?.units?.["USD/shares"] ?? []) as XbrlFact[];
  const mismatched = msft.quarters.filter((r) => {
    if (r.provenance.eps_diluted?.method !== "reported" || r.values.eps_diluted === null) return false;
    return !raw.some((f) => f.end === r.period_end && f.val === r.values.eps_diluted);
  });
  const reportedCount = msft.quarters.filter((r) => r.provenance.eps_diluted?.method === "reported").length;
  check(
    "MSFT: every reported quarterly EPS is SEC's own figure, unchanged",
    reportedCount > 10 && mismatched.length === 0,
    `${reportedCount} reported quarters; mismatched: ${mismatched.map((r) => r.period_end).join(", ") || "none"}`,
  );
  const m25q4 = q(msft.quarters, 2025, 4)?.values.eps_diluted;
  check("MSFT FY2025 Q4 EPS (derived) is the filed 3.65", m25q4 === 3.65, `got ${m25q4}`);

  // ---- the rejection rule, on a company that reports inconsistent figures ------
  let n = 0;
  const f = (start: string, end: string, val: number, form: string, filed: string): XbrlFact => ({ start, end, val, form, filed, accn: `x-${++n}` });
  const odd: CompanyFacts = {
    cik: 1,
    facts: {
      "us-gaap": {
        NetIncomeLoss: {
          units: {
            USD: [
              f("2024-01-01", "2024-12-31", 400, "10-K", "2025-02-01"),
              f("2024-01-01", "2024-03-31", 100, "10-Q", "2024-05-01"),
              f("2024-04-01", "2024-06-30", 100, "10-Q", "2024-08-01"),
              f("2024-07-01", "2024-09-30", 100, "10-Q", "2024-11-01"),
            ],
          },
        },
        EarningsPerShareDiluted: {
          units: {
            "USD/shares": [
              // Annual EPS below the sum of the quarters (a buyback-heavy year, or a restatement).
              f("2024-01-01", "2024-12-31", 1.0, "10-K", "2025-02-01"),
              f("2024-01-01", "2024-03-31", 0.4, "10-Q", "2024-05-01"),
              f("2024-04-01", "2024-06-30", 0.4, "10-Q", "2024-08-01"),
              f("2024-07-01", "2024-09-30", 0.4, "10-Q", "2024-11-01"),
            ],
          },
        },
        CommonStockDividendsPerShareDeclared: {
          units: {
            "USD/shares": [
              f("2024-01-01", "2024-12-31", 0.3, "10-K", "2025-02-01"),
              f("2024-01-01", "2024-03-31", 0.1, "10-Q", "2024-05-01"),
              f("2024-04-01", "2024-06-30", 0.15, "10-Q", "2024-08-01"),
              f("2024-07-01", "2024-09-30", 0.15, "10-Q", "2024-11-01"),
            ],
          },
        },
      },
    },
  };
  const oddQ4 = q(parseCompanyFacts(odd).quarters, 2024, 4);
  check(
    "a derived Q4 EPS below zero while net income is positive is rejected (null), not stored",
    oddQ4?.values.eps_diluted === null && oddQ4?.values.net_income === 100 && !!oddQ4?.provenance.eps_diluted?.rejected,
    `eps ${oddQ4?.values.eps_diluted}, provenance ${JSON.stringify(oddQ4?.provenance.eps_diluted)}`,
  );
  check(
    "a derived negative dividend per share is rejected (null)",
    oddQ4?.values.dividends_per_share === null && !!oddQ4?.provenance.dividends_per_share?.rejected,
    `dps ${oddQ4?.values.dividends_per_share}, provenance ${JSON.stringify(oddQ4?.provenance.dividends_per_share)}`,
  );

  // ---- display -----------------------------------------------------------------
  check("per-share display: 1.7600000000000002 -> $1.76", perShare(1.7600000000000002) === "$1.76", perShare(1.7600000000000002));
  check("per-share display keeps a sub-cent dividend: 0.004 -> $0.004", perShare(0.004) === "$0.004", perShare(0.004));
  check("per-share display: negative EPS -> -$0.25", perShare(-0.25) === "-$0.25", perShare(-0.25));

  return { suiteName: "Split-adjusted per-share figures (SEC)", gating: true, cases };
}

function main() {
  const suite = runSplitAdjustmentSuite();
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
