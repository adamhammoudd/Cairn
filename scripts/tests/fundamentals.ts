// Section 1 (feat/fundamentals-expansion): the SEC companyfacts parser and the
// company metrics computed from it.
//
// These fixtures are SYNTHETIC, in the exact shape of SEC's companyfacts JSON
// (facts["us-gaap"][concept].units[unit][] with start/end/val/accn/fy/fp/form/
// filed). Each one isolates a rule: the Q4 derivation, year-to-date
// differencing, comparatives carrying a later filing's fy, restatements,
// per-period fallback chains, instants, 52/53-week years, and the open year.
// Round numbers make every expected value checkable by eye.
//
// The real-filing fixtures the brief asks for (NVDA, MSFT, KO, checked by hand
// against their 10-Q/10-K) are NOT here: data.sec.gov is blocked by this
// environment's network policy. scripts/fetch-sec-fixtures.mjs fetches and
// trims them once it is reachable; see the PR.
//
// Run: npx tsx --conditions=react-server scripts/tests/fundamentals.ts

import { pathToFileURL } from "node:url";
import {
  parseCompanyFacts,
  parseEarningsReleases,
  fiscalYearLabel,
  type CompanyFacts,
  type XbrlFact,
  type QuarterRow,
} from "../../supabase/functions/_shared/sec-companyfacts";
import {
  companyMetrics,
  companyDataStatus,
  dividendGrowthYears,
  earningsReactions,
  peHistory,
  totalDebt,
  ttm,
  ttmSnapshot,
  sortQuarters,
  median,
  type Quarter,
  type PricePoint,
} from "@/lib/fundamentals";
import { writeReport, type SuiteResult, type TestCase } from "./report";

// ------------------------------------------------------------ fixture helpers

type Units = Record<string, XbrlFact[]>;
function doc(concepts: Record<string, Units>): CompanyFacts {
  const usGaap: Record<string, { units: Units }> = {};
  for (const [k, units] of Object.entries(concepts)) usGaap[k] = { units };
  return { cik: 1234, entityName: "Test Co", facts: { "us-gaap": usGaap } };
}
let accnSeq = 0;
function fact(start: string | undefined, end: string, val: number, form: string, filed: string, fy?: number, fp?: string): XbrlFact {
  return { ...(start ? { start } : {}), end, val, form, filed, accn: `0000-${++accnSeq}`, fy: fy ?? null, fp: fp ?? null };
}
const q = (rows: QuarterRow[], fy: number, qn: number) => rows.find((r) => r.fiscal_year === fy && r.fiscal_quarter === qn);

/** Calendar-year company, FY2023 and FY2024, quarters via 10-Q 3-month facts. */
function calendarCompany(): CompanyFacts {
  return doc({
    Revenues: {
      USD: [
        // FY2023 (10-K filed 2024), and the same year again as a comparative in the FY2024 10-K (fy=2024).
        fact("2023-01-01", "2023-12-31", 800, "10-K", "2024-02-10", 2023, "FY"),
        fact("2023-01-01", "2023-12-31", 800, "10-K", "2025-02-10", 2024, "FY"),
        fact("2023-01-01", "2023-03-31", 180, "10-Q", "2023-05-01", 2023, "Q1"),
        fact("2023-04-01", "2023-06-30", 190, "10-Q", "2023-08-01", 2023, "Q2"),
        fact("2023-07-01", "2023-09-30", 200, "10-Q", "2023-11-01", 2023, "Q3"),
        fact("2024-01-01", "2024-12-31", 1000, "10-K", "2025-02-10", 2024, "FY"),
        fact("2024-01-01", "2024-03-31", 200, "10-Q", "2024-05-01", 2024, "Q1"),
        // Restated in the next year's Q1 10-Q comparative: the later filing wins.
        fact("2024-01-01", "2024-03-31", 205, "10-Q", "2025-05-01", 2025, "Q1"),
        fact("2024-04-01", "2024-06-30", 250, "10-Q", "2024-08-01", 2024, "Q2"),
        fact("2024-07-01", "2024-09-30", 260, "10-Q", "2024-11-01", 2024, "Q3"),
        // Open year FY2025: Q1 only.
        fact("2025-01-01", "2025-03-31", 300, "10-Q", "2025-05-01", 2025, "Q1"),
        // An 8-K fact must be ignored.
        fact("2025-04-01", "2025-06-30", 9999, "8-K", "2025-07-20", 2025, "Q2"),
      ],
    },
    // Cash flow: year-to-date only in 10-Qs.
    NetCashProvidedByUsedInOperatingActivities: {
      USD: [
        fact("2024-01-01", "2024-03-31", 100, "10-Q", "2024-05-01", 2024, "Q1"),
        fact("2024-01-01", "2024-06-30", 250, "10-Q", "2024-08-01", 2024, "Q2"),
        fact("2024-01-01", "2024-09-30", 420, "10-Q", "2024-11-01", 2024, "Q3"),
        fact("2024-01-01", "2024-12-31", 600, "10-K", "2025-02-10", 2024, "FY"),
      ],
    },
    PaymentsToAcquirePropertyPlantAndEquipment: {
      USD: [
        fact("2024-01-01", "2024-03-31", 10, "10-Q", "2024-05-01", 2024, "Q1"),
        fact("2024-01-01", "2024-06-30", 30, "10-Q", "2024-08-01", 2024, "Q2"),
        fact("2024-01-01", "2024-09-30", 45, "10-Q", "2024-11-01", 2024, "Q3"),
        fact("2024-01-01", "2024-12-31", 70, "10-K", "2025-02-10", 2024, "FY"),
      ],
    },
    EarningsPerShareDiluted: {
      "USD/shares": [
        fact("2024-01-01", "2024-03-31", 0.5, "10-Q", "2024-05-01", 2024, "Q1"),
        fact("2024-04-01", "2024-06-30", 0.6, "10-Q", "2024-08-01", 2024, "Q2"),
        fact("2024-07-01", "2024-09-30", 0.7, "10-Q", "2024-11-01", 2024, "Q3"),
        fact("2024-01-01", "2024-12-31", 2.5, "10-K", "2025-02-10", 2024, "FY"),
        // 6-month EPS must not be differenced into a Q2 figure.
        fact("2024-01-01", "2024-06-30", 1.1, "10-Q", "2024-08-01", 2024, "Q2"),
      ],
    },
    CashAndCashEquivalentsAtCarryingValue: {
      USD: [
        fact(undefined, "2024-03-31", 50, "10-Q", "2024-05-01", 2024, "Q1"),
        fact(undefined, "2024-12-31", 80, "10-K", "2025-02-10", 2024, "FY"),
      ],
    },
    LongTermDebt: { USD: [fact(undefined, "2024-12-31", 300, "10-K", "2025-02-10", 2024, "FY")] },
    // Must NOT be added to LongTermDebt, which already contains it.
    LongTermDebtCurrent: { USD: [fact(undefined, "2024-12-31", 40, "10-K", "2025-02-10", 2024, "FY")] },
    ShortTermBorrowings: { USD: [fact(undefined, "2024-12-31", 20, "10-K", "2025-02-10", 2024, "FY")] },
  });
}

function asQuarter(r: QuarterRow): Quarter {
  return { fiscal_year: r.fiscal_year, fiscal_quarter: r.fiscal_quarter, period_end: r.period_end, ...r.values };
}

function blankQuarter(fy: number, qn: 1 | 2 | 3 | 4, end: string, v: Partial<Quarter> = {}): Quarter {
  return {
    fiscal_year: fy,
    fiscal_quarter: qn,
    period_end: end,
    revenue: null,
    net_income: null,
    operating_income: null,
    depreciation_amortization: null,
    operating_cash_flow: null,
    capex: null,
    dividends_paid: null,
    eps_diluted: null,
    dividends_per_share: null,
    cash: null,
    long_term_debt: null,
    long_term_debt_noncurrent: null,
    long_term_debt_current: null,
    debt_current: null,
    short_term_borrowings: null,
    ...v,
  };
}

/** Eight calendar quarters 2023Q1..2024Q4 with simple, checkable figures. */
function eightQuarters(): Quarter[] {
  const ends = ["03-31", "06-30", "09-30", "12-31"];
  const out: Quarter[] = [];
  for (const fy of [2023, 2024]) {
    for (let i = 0; i < 4; i++) {
      const k = (fy - 2023) * 4 + i; // 0..7
      out.push(
        blankQuarter(fy, (i + 1) as 1 | 2 | 3 | 4, `${fy}-${ends[i]}`, {
          revenue: 100 + k * 10, // 2023: 100,110,120,130 = 460; 2024: 140..170 = 620
          net_income: 20 + k * 2, // 2023: 92; 2024: 124
          operating_income: 30,
          depreciation_amortization: 5,
          operating_cash_flow: 40,
          capex: 10,
          dividends_paid: 6,
          eps_diluted: 1,
          dividends_per_share: fy === 2023 ? 0.5 : 0.55,
          cash: 100,
          long_term_debt: 250,
        }),
      );
    }
  }
  return out;
}

// ------------------------------------------------------------------- suite

export function runFundamentalsSuite(): SuiteResult {
  const cases: TestCase[] = [];
  const check = (name: string, ok: boolean, detail: string) => cases.push({ name, status: ok ? "pass" : "fail", detail });

  // ---- parser -------------------------------------------------------------
  const parsed = parseCompanyFacts(calendarCompany());
  const rows = parsed.quarters;

  const q4 = q(rows, 2024, 4);
  check(
    "Q4 = full year - Q1 - Q2 - Q3 when all three are present",
    q4?.values.revenue === 1000 - 205 - 250 - 260 && q4?.provenance.revenue?.method === "fy_minus_q1_q3",
    `Q4 revenue ${q4?.values.revenue} via ${q4?.provenance.revenue?.method} (1000 - 205 - 250 - 260 = 285)`,
  );
  check(
    "FY2023's Q4 is derived too (all three quarters present)",
    q(rows, 2023, 4)?.values.revenue === 800 - 180 - 190 - 200,
    `FY2023 Q4 ${q(rows, 2023, 4)?.values.revenue} (800 - 570 = 230)`,
  );

  const missingQ2 = parseCompanyFacts(
    doc({
      Revenues: {
        USD: [
          fact("2024-01-01", "2024-12-31", 1000, "10-K", "2025-02-10"),
          fact("2024-01-01", "2024-03-31", 200, "10-Q", "2024-05-01"),
          fact("2024-07-01", "2024-09-30", 260, "10-Q", "2024-11-01"),
        ],
      },
    }),
  ).quarters;
  check(
    "Q4 is NOT derived when Q2 is missing, and Q2 is not invented",
    q(missingQ2, 2024, 4) === undefined && q(missingQ2, 2024, 2) === undefined,
    `quarters present: ${missingQ2.map((r) => `${r.fiscal_year}Q${r.fiscal_quarter}`).join(", ")}`,
  );

  check(
    "a restated figure (later filing) replaces the original",
    q(rows, 2024, 1)?.values.revenue === 205,
    `2024 Q1 revenue ${q(rows, 2024, 1)?.values.revenue}; filed 200 in 2024, restated 205 in 2025`,
  );
  check(
    "a comparative carrying a later filing's fy does not create or relabel a year",
    fiscalYearLabel("2023-12-31") === 2023 && q(rows, 2023, 1)?.values.revenue === 180 && !rows.some((r) => r.fiscal_year === 2026),
    `years: ${[...new Set(rows.map((r) => r.fiscal_year))].join(", ")}`,
  );
  check(
    "8-K facts are ignored",
    q(rows, 2025, 2) === undefined,
    `2025 Q2 ${q(rows, 2025, 2) ? "present" : "absent"}`,
  );
  check(
    "the open year after the latest 10-K gets its quarters",
    q(rows, 2025, 1)?.values.revenue === 300,
    `2025 Q1 revenue ${q(rows, 2025, 1)?.values.revenue}`,
  );

  const q2 = q(rows, 2024, 2);
  const q3 = q(rows, 2024, 3);
  check(
    "cash-flow quarters come from year-to-date differences",
    q(rows, 2024, 1)?.values.operating_cash_flow === 100 &&
      q2?.values.operating_cash_flow === 150 &&
      q3?.values.operating_cash_flow === 170 &&
      q4?.values.operating_cash_flow === 180 &&
      q2?.provenance.operating_cash_flow?.method === "ytd_difference",
    `OCF ${[1, 2, 3, 4].map((n) => q(rows, 2024, n)?.values.operating_cash_flow).join(", ")} (YTD 100/250/420, FY 600)`,
  );
  check(
    "capital spending likewise (10 / 20 / 15 / 25)",
    [1, 2, 3, 4].map((n) => q(rows, 2024, n)?.values.capex).join(",") === "10,20,15,25",
    [1, 2, 3, 4].map((n) => q(rows, 2024, n)?.values.capex).join(", "),
  );

  check(
    "per-share figures are never differenced from year-to-date EPS",
    q2?.values.eps_diluted === 0.6,
    `Q2 EPS ${q2?.values.eps_diluted} (reported 3-month 0.6, not 1.1 - 0.5)`,
  );
  check(
    "Q4 EPS derived from the year is marked approximate",
    Math.abs((q4?.values.eps_diluted ?? 0) - 0.7) < 1e-9 && q4?.provenance.eps_diluted?.approximate === true,
    `Q4 EPS ${q4?.values.eps_diluted?.toFixed(2)} approximate=${q4?.provenance.eps_diluted?.approximate}`,
  );

  check(
    "balance-sheet instants attach to their quarter end",
    q(rows, 2024, 1)?.values.cash === 50 && q4?.values.cash === 80 && q2?.values.cash === null,
    `cash Q1 ${q(rows, 2024, 1)?.values.cash}, Q2 ${q2?.values.cash}, Q4 ${q4?.values.cash}`,
  );
  check(
    "total debt does not double-count the current portion LongTermDebt already includes",
    q4 !== undefined && totalDebt(asQuarter(q4)) === 300 + 20,
    `LongTermDebt 300 + short-term 20 = ${q4 ? totalDebt(asQuarter(q4)) : "n/a"}; LongTermDebtCurrent 40 not added`,
  );
  check(
    "without LongTermDebt, total debt = noncurrent + DebtCurrent",
    totalDebt(blankQuarter(2024, 4, "2024-12-31", { long_term_debt_noncurrent: 500, debt_current: 60, short_term_borrowings: 20 })) === 560,
    "500 + 60 (DebtCurrent already holds short-term borrowings)",
  );
  check(
    "a company reporting no debt concept is null, not zero",
    totalDebt(blankQuarter(2024, 4, "2024-12-31")) === null,
    "no concept -> null",
  );

  // Per-period fallback chain.
  const switched = parseCompanyFacts(
    doc({
      SalesRevenueNet: {
        USD: [
          fact("2017-01-01", "2017-12-31", 400, "10-K", "2018-02-10"),
          fact("2017-01-01", "2017-03-31", 100, "10-Q", "2017-05-01"),
        ],
      },
      RevenueFromContractWithCustomerExcludingAssessedTax: {
        USD: [
          fact("2018-01-01", "2018-12-31", 480, "10-K", "2019-02-10"),
          fact("2018-01-01", "2018-03-31", 120, "10-Q", "2018-05-01"),
        ],
      },
    }),
  ).quarters;
  check(
    "fallback concepts apply per period (SalesRevenueNet era, then RevenueFromContract era)",
    q(switched, 2017, 1)?.provenance.revenue?.concept === "SalesRevenueNet" &&
      q(switched, 2018, 1)?.provenance.revenue?.concept === "RevenueFromContractWithCustomerExcludingAssessedTax",
    `2017Q1 ${q(switched, 2017, 1)?.provenance.revenue?.concept}, 2018Q1 ${q(switched, 2018, 1)?.provenance.revenue?.concept}`,
  );

  const mixed = parseCompanyFacts(
    doc({
      Revenues: { USD: [fact("2024-01-01", "2024-12-31", 1000, "10-K", "2025-02-10")] },
      RevenueFromContractWithCustomerExcludingAssessedTax: {
        USD: [
          fact("2024-01-01", "2024-03-31", 200, "10-Q", "2024-05-01"),
          fact("2024-04-01", "2024-06-30", 250, "10-Q", "2024-08-01"),
          fact("2024-07-01", "2024-09-30", 260, "10-Q", "2024-11-01"),
        ],
      },
    }),
  ).quarters;
  check(
    "a derivation never mixes concepts (year from one, quarters from another -> no Q4)",
    q(mixed, 2024, 4) === undefined,
    `2024 Q4 ${q(mixed, 2024, 4) ? q(mixed, 2024, 4)!.values.revenue : "absent"}`,
  );

  // 52/53-week year ending in late January (NVIDIA-style): FY2026 = 27 Jan 2025 - 25 Jan 2026.
  const weekly = parseCompanyFacts(
    doc({
      Revenues: {
        USD: [
          fact("2025-01-27", "2026-01-25", 1300, "10-K", "2026-02-26"),
          fact("2025-01-27", "2025-04-27", 300, "10-Q", "2025-05-28"),
          fact("2025-04-28", "2025-07-27", 310, "10-Q", "2025-08-27"),
          fact("2025-07-28", "2025-10-26", 330, "10-Q", "2025-11-19"),
        ],
      },
    }),
  ).quarters;
  check(
    "a 52-week year ending in late January is labelled by its end year, and its Q4 derived",
    q(weekly, 2026, 4)?.values.revenue === 360 && q(weekly, 2026, 4)?.period_end === "2026-01-25",
    `FY2026 Q4 ${q(weekly, 2026, 4)?.values.revenue} ending ${q(weekly, 2026, 4)?.period_end}`,
  );
  check(
    "a year ending in the first days of January belongs to the year before",
    fiscalYearLabel("2025-01-03") === 2024 && fiscalYearLabel("2026-01-25") === 2026,
    `${fiscalYearLabel("2025-01-03")} / ${fiscalYearLabel("2026-01-25")}`,
  );

  // ---- earnings releases ----------------------------------------------------
  const releases = parseEarningsReleases({
    filings: {
      recent: {
        accessionNumber: ["a1", "a2", "a3", "a4", "a5"],
        form: ["8-K", "8-K", "10-Q", "8-K", "8-K/A"],
        filingDate: ["2026-08-26", "2026-05-28", "2026-05-29", "2026-02-10", "2026-08-27"],
        // 20:21Z = 16:21 EDT (after close); 12:05Z = 08:05 EDT (before open);
        // 17:00Z in February = 12:00 EST (during session).
        acceptanceDateTime: ["2026-08-26T20:21:05.000Z", "2026-05-28T12:05:00.000Z", "2026-05-29T10:00:00.000Z", "2026-02-10T17:00:00.000Z", "2026-08-27T10:00:00.000Z"],
        items: ["2.02,9.01", "2.02", "", "5.02", "2.02"],
      },
    },
  });
  check(
    "earnings releases are original 8-Ks with item 2.02 (not 8-K/A), timed in New York time",
    releases.length === 2 &&
      !releases.some((r) => r.accn === "a5") &&
      releases.find((r) => r.release_date === "2026-08-26")?.timing === "after_close" &&
      releases.find((r) => r.release_date === "2026-05-28")?.timing === "before_open",
    releases.map((r) => `${r.release_date} ${r.timing}`).join("; "),
  );

  // ---- metrics --------------------------------------------------------------
  const eight = eightQuarters();
  const newest = sortQuarters(eight);
  check("TTM sums the latest four consecutive quarters", ttm(newest, "revenue") === 620, `TTM revenue ${ttm(newest, "revenue")}`);
  const gap = newest.filter((r) => !(r.fiscal_year === 2024 && r.fiscal_quarter === 2));
  check("TTM is null across a missing quarter (no estimate)", ttm(gap, "revenue") === null, `with 2024Q2 missing: ${ttm(gap, "revenue")}`);
  const withNull = newest.map((r, i) => (i === 1 ? { ...r, revenue: null } : r));
  check("TTM is null when any quarter's figure is missing", ttm(withNull, "revenue") === null, `${ttm(withNull, "revenue")}`);

  const m = companyMetrics(eight)!;
  check(
    "growth = TTM vs the TTM a year earlier",
    Math.abs((m.revenueGrowth ?? 0) - (620 / 460 - 1)) < 1e-12 && Math.abs((m.netIncomeGrowth ?? 0) - (124 / 92 - 1)) < 1e-12,
    `revenue ${(m.revenueGrowth! * 100).toFixed(1)}%, profit ${(m.netIncomeGrowth! * 100).toFixed(1)}%`,
  );
  check(
    "latest quarter YoY and the prior quarter's, for speeding up / slowing",
    Math.abs((m.revenueGrowthLatestQuarter ?? 0) - (170 / 130 - 1)) < 1e-12 && Math.abs((m.revenueGrowthPriorQuarter ?? 0) - (160 / 120 - 1)) < 1e-12,
    `${(m.revenueGrowthLatestQuarter! * 100).toFixed(1)}% vs ${(m.revenueGrowthPriorQuarter! * 100).toFixed(1)}%`,
  );
  check(
    "EBITDA = operating profit + D&A, and its margin",
    m.ttm.ebitda === 140 && Math.abs((m.ebitdaMargin ?? 0) - 140 / 620) < 1e-12,
    `EBITDA ${m.ttm.ebitda}, margin ${(m.ebitdaMargin! * 100).toFixed(1)}%`,
  );
  check("free cash flow = operating cash flow - capital spending", m.ttm.free_cash_flow === 120, `FCF ${m.ttm.free_cash_flow}`);
  check(
    "net debt and net debt / EBITDA",
    m.netDebt === 150 && Math.abs((m.netDebtToEbitda ?? 0) - 150 / 140) < 1e-12,
    `net debt ${m.netDebt}, ${m.netDebtToEbitda?.toFixed(2)}x EBITDA`,
  );
  check(
    "payout ratio vs free cash flow and vs net profit",
    m.payoutOfFcf === 24 / 120 && Math.abs((m.payoutOfNetIncome ?? 0) - 24 / 124) < 1e-12,
    `${(m.payoutOfFcf! * 100).toFixed(1)}% of FCF, ${(m.payoutOfNetIncome! * 100).toFixed(1)}% of profit`,
  );
  const losing = companyMetrics(eight.map((r) => ({ ...r, net_income: -5 })))!;
  check(
    "growth and payout from a loss are null, not a percentage",
    losing.netIncomeGrowth === null && losing.payoutOfNetIncome === null,
    `growth ${losing.netIncomeGrowth}, payout ${losing.payoutOfNetIncome}`,
  );

  // P/E history.
  const prices: PricePoint[] = [];
  for (const r of eight) prices.push({ date: r.period_end, close: 40 });
  const shortPe = peHistory(eight, prices, 44);
  check(
    "P/E uses the close at each quarter end over TTM EPS; the average needs 8+ quarter ends",
    shortPe.points.length === 5 && shortPe.points.every((p) => p.pe === 10) && shortPe.fiveYearAverage === null && shortPe.current?.pe === 11,
    `${shortPe.points.length} points (TTM needs 4 quarters), average ${shortPe.fiveYearAverage}, current ${shortPe.current?.pe}`,
  );
  const epsLoss = eight.map((r) => (r.fiscal_year === 2024 ? { ...r, eps_diluted: -1 } : r));
  check(
    "quarters with TTM EPS <= 0 have no P/E",
    peHistory(epsLoss, prices, 44).points.every((p) => p.eps > 0) && peHistory(epsLoss, prices, 44).current === null,
    `${peHistory(epsLoss, prices, 44).points.length} points left`,
  );
  const annualEps = new Map([[2024, 3.9]]);
  check(
    "TTM EPS at a fiscal year end uses the reported annual EPS",
    ttmSnapshot(newest, 0, annualEps)?.eps === 3.9 && ttmSnapshot(newest, 1, annualEps)?.eps === 4,
    `year end ${ttmSnapshot(newest, 0, annualEps)?.eps}, a quarter earlier ${ttmSnapshot(newest, 1, annualEps)?.eps}`,
  );

  check("years of dividend growth counts complete years that rose", dividendGrowthYears(eight) === 1, `${dividendGrowthYears(eight)}`);
  check(
    "fewer than two complete years is null (not enough to say)",
    dividendGrowthYears(eight.filter((r) => r.fiscal_year === 2024)) === null,
    `${dividendGrowthYears(eight.filter((r) => r.fiscal_year === 2024))}`,
  );

  // Earnings-day reactions.
  const px: PricePoint[] = [
    { date: "2026-08-25", close: 100 },
    { date: "2026-08-26", close: 102 },
    { date: "2026-08-27", close: 96.9 },
    { date: "2026-05-27", close: 50 },
    { date: "2026-05-28", close: 55 },
  ].sort((a, b) => (a.date < b.date ? -1 : 1));
  const reactions = earningsReactions(
    [
      { release_date: "2026-08-26", timing: "after_close" },
      { release_date: "2026-05-28", timing: "before_open" },
      { release_date: "2026-02-10", timing: "unknown" },
    ],
    px,
  );
  const aug = reactions.find((r) => r.release_date === "2026-08-26");
  const may = reactions.find((r) => r.release_date === "2026-05-28");
  check(
    "after-close releases move the next session; before-open ones the same session",
    reactions.length === 2 && aug?.reaction_date === "2026-08-27" && Math.abs(aug.move - (96.9 / 102 - 1)) < 1e-12 && may?.reaction_date === "2026-05-28" && Math.abs(may.move - 0.1) < 1e-12,
    reactions.map((r) => `${r.release_date} -> ${r.reaction_date} ${(r.move * 100).toFixed(1)}%`).join("; "),
  );
  check("median of absolute moves", median([0.05, -0.1, 0.02].map(Math.abs)) === 0.05, `${median([0.05, 0.1, 0.02])}`);

  check(
    "ETFs and crypto are not applicable; an equity without filings is unavailable",
    companyDataStatus("etf", 0) === "not_applicable" &&
      companyDataStatus("crypto", 0) === "not_applicable" &&
      companyDataStatus("equity", 0) === "unavailable" &&
      companyDataStatus("equity", 8) === "available",
    "etf/crypto/equity(0)/equity(8)",
  );

  return { suiteName: "Company data (SEC companyfacts parser + metrics)", gating: true, cases };
}

function main() {
  const suite = runFundamentalsSuite();
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
