// Regression test for fix/financial-health-inputs.
//
// NVDA's scorecard read "Financial health: Not available" although its cash
// flow is stored. The health rule needs trailing EBITDA (operating income +
// D&A), free cash flow (operating cash flow - capital spending) and revenue.
// Debt was not the gap. What was missing, live on 2026-09-26:
//   - capex for NVDA, KTOS, AMZN and ISRG: they file it as
//     PaymentsToAcquireProductiveAssets ("purchases related to property and
//     equipment and intangible assets"), not PaymentsToAcquirePropertyPlantAndEquipment;
//   - D&A for MSFT and TSLA: their cash-flow D&A line is a company-specific
//     tag, so only us-gaap `Depreciation` is available.
//
// Fixtures are REAL SEC companyfacts (scripts/tests/fixtures/sec-health/),
// trimmed to the concepts read here, values unmodified.
//
// Run: npx tsx --conditions=react-server scripts/tests/health-inputs.ts

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseCompanyFacts, type CompanyFacts, type QuarterRow } from "../../supabase/functions/_shared/sec-companyfacts";
import { companyMetrics, sortQuarters, type Quarter } from "@/lib/fundamentals";
import { healthDimension } from "@/lib/scorecard";
import { writeReport, type SuiteResult, type TestCase } from "./report";

const here = path.dirname(fileURLToPath(import.meta.url));
const load = (s: string): CompanyFacts => JSON.parse(fs.readFileSync(path.join(here, "fixtures", "sec-health", `${s}.json`), "utf8")).companyfacts;
const asQuarter = (r: QuarterRow): Quarter => ({ fiscal_year: r.fiscal_year, fiscal_quarter: r.fiscal_quarter, period_end: r.period_end, ...r.values });
const q = (rows: QuarterRow[], fy: number, qn: number) => rows.find((r) => r.fiscal_year === fy && r.fiscal_quarter === qn);

function health(symbol: string) {
  const parsed = parseCompanyFacts(load(symbol));
  const quarters = sortQuarters(parsed.quarters.map(asQuarter));
  const metrics = companyMetrics(quarters);
  return { parsed, metrics, dim: healthDimension(metrics, null) };
}

export function runHealthInputsSuite(): SuiteResult {
  const cases: TestCase[] = [];
  const check = (name: string, ok: boolean, detail: string) => cases.push({ name, status: ok ? "pass" : "fail", detail });

  // ---- NVDA: capex -------------------------------------------------------------
  const nvda = health("NVDA");
  const n = q(nvda.parsed.quarters, 2027, 2);
  check(
    "NVDA FY2027 Q2 capital spending is read (PaymentsToAcquireProductiveAssets)",
    typeof n?.values.capex === "number" && n.values.capex > 0 && n.provenance.capex?.concept === "PaymentsToAcquireProductiveAssets",
    `capex ${n?.values.capex} via ${n?.provenance.capex?.concept}`,
  );
  check("NVDA trailing free cash flow is known", nvda.metrics?.ttm.free_cash_flow != null, `FCF ${nvda.metrics?.ttm.free_cash_flow}`);
  check(
    "NVDA financial health is rated, not 'Not available'",
    nvda.dim.verdict !== "Not available" && nvda.dim.level !== "not_applicable",
    `${nvda.dim.verdict}: ${nvda.dim.sentence}`,
  );
  check(
    "NVDA keeps DepreciationDepletionAndAmortization first (the fallback does not override it)",
    n?.provenance.depreciation_amortization?.concept === "DepreciationDepletionAndAmortization",
    `${n?.provenance.depreciation_amortization?.concept}`,
  );

  // ---- MSFT and TSLA: D&A ------------------------------------------------------
  for (const sym of ["MSFT", "TSLA"]) {
    const h = health(sym);
    const latest = sortQuarters(h.parsed.quarters.map((r) => ({ ...asQuarter(r), prov: r.provenance })))[0];
    check(
      `${sym} latest quarter has D&A (us-gaap Depreciation; its own D&A line is a company-specific tag)`,
      typeof latest.depreciation_amortization === "number" && latest.prov.depreciation_amortization?.concept === "Depreciation",
      `D&A ${latest.depreciation_amortization} via ${latest.prov.depreciation_amortization?.concept} (FY${latest.fiscal_year}Q${latest.fiscal_quarter})`,
    );
    check(
      `${sym} financial health is rated, not 'Not available'`,
      h.dim.verdict !== "Not available" && h.dim.level !== "not_applicable",
      `${h.dim.verdict}: ${h.dim.sentence}`,
    );
  }

  // ---- ISRG: D&A is annual-only in companyfacts ------------------------------
  // Audit 2026-10-02 item 1.5. ISRG files capex (PaymentsToAcquireProductiveAssets)
  // and operating cash flow quarterly, but its quarterly D&A sits in a
  // company-specific tag that companyfacts does not carry; us-gaap
  // `Depreciation` exists for full years only. Quarterly D&A is therefore null,
  // so trailing EBITDA was null and the health card read "Not available".
  const isrg = health("ISRG");
  check(
    "ISRG capital spending and operating cash flow are read, so free cash flow is known",
    isrg.metrics?.ttm.free_cash_flow != null,
    `FCF ${isrg.metrics?.ttm.free_cash_flow}`,
  );
  check(
    "ISRG financial health is rated, not 'Not available'",
    isrg.dim.verdict !== "Not available" && isrg.dim.level !== "not_applicable",
    `${isrg.dim.verdict}: ${isrg.dim.sentence}`,
  );
  check(
    "ISRG's health card says it used operating profit, because D&A is not available quarterly",
    /operating profit/i.test(isrg.dim.sentence) && !/EBITDA/.test(isrg.dim.sentence),
    isrg.dim.sentence,
  );

  return { suiteName: "Financial health inputs (capex + D&A concepts)", gating: true, cases };
}

function main() {
  const suite = runHealthInputsSuite();
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
