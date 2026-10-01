// Company metrics computed in code from stored SEC quarters
// (company_financials_quarterly, filled by ingest-fundamentals through
// supabase/functions/_shared/sec-companyfacts.ts). Pure: every function takes
// rows and prices and returns numbers or null. Nothing here estimates a
// missing figure - an input that is absent makes the output null, and the
// caller says "not available".
//
// Conventions:
//   * Rows are fiscal quarters. "TTM" (trailing twelve months) is the sum of
//     the latest four CONSECUTIVE quarters, all present, or null.
//   * Growth is a fraction (0.56 = +56%). A base at or below zero gives null:
//     "growth" from a loss is not a meaningful percentage.
//   * Capital spending and dividends paid are positive outflows, as SEC
//     reports them. Free cash flow = operating cash flow - capital spending.

export interface QuarterValues {
  revenue: number | null;
  net_income: number | null;
  operating_income: number | null;
  depreciation_amortization: number | null;
  operating_cash_flow: number | null;
  capex: number | null;
  dividends_paid: number | null;
  eps_diluted: number | null;
  dividends_per_share: number | null;
  cash: number | null;
  long_term_debt: number | null;
  long_term_debt_noncurrent: number | null;
  long_term_debt_current: number | null;
  debt_current: number | null;
  short_term_borrowings: number | null;
}

export interface Quarter extends QuarterValues {
  fiscal_year: number;
  fiscal_quarter: 1 | 2 | 3 | 4;
  period_end: string;
}

export type SummedField =
  | "revenue"
  | "net_income"
  | "operating_income"
  | "depreciation_amortization"
  | "operating_cash_flow"
  | "capex"
  | "dividends_paid"
  | "eps_diluted"
  | "dividends_per_share";

/** Newest first. */
export function sortQuarters<T extends Quarter>(rows: T[]): T[] {
  return rows.slice().sort((a, b) => (a.period_end < b.period_end ? 1 : -1));
}

function index(q: Pick<Quarter, "fiscal_year" | "fiscal_quarter">): number {
  return q.fiscal_year * 4 + (q.fiscal_quarter - 1);
}

/** The four quarters ending `offset` quarters back, if consecutive; newest first. */
export function window4<T extends Quarter>(rowsNewestFirst: T[], offset = 0): T[] | null {
  const w = rowsNewestFirst.slice(offset, offset + 4);
  if (w.length < 4) return null;
  for (let i = 1; i < 4; i++) if (index(w[i - 1]) - index(w[i]) !== 1) return null;
  return w;
}

export function ttm(rowsNewestFirst: Quarter[], field: SummedField, offset = 0): number | null {
  const w = window4(rowsNewestFirst, offset);
  if (!w) return null;
  let sum = 0;
  for (const q of w) {
    const v = q[field];
    if (v === null || !Number.isFinite(v)) return null;
    sum += v;
  }
  return sum;
}

export function ebitda(operatingIncome: number | null, da: number | null): number | null {
  return operatingIncome === null || da === null ? null : operatingIncome + da;
}

export function freeCashFlow(ocf: number | null, capex: number | null): number | null {
  return ocf === null || capex === null ? null : ocf - capex;
}

/**
 * Total debt from the stored components, without double counting:
 * `LongTermDebt` already includes its current portion (us-gaap definition),
 * so it is used alone when present; otherwise noncurrent + current. Short-term
 * borrowings are added in both cases unless `DebtCurrent` (which contains
 * them) was used. Null when no debt concept was reported at all - a company
 * that reports none is not assumed debt-free.
 */
export function totalDebt(q: QuarterValues): number | null {
  if (q.long_term_debt !== null) return q.long_term_debt + (q.short_term_borrowings ?? 0);
  if (q.long_term_debt_noncurrent !== null || q.debt_current !== null || q.long_term_debt_current !== null) {
    const current = q.debt_current ?? (q.long_term_debt_current ?? 0) + (q.short_term_borrowings ?? 0);
    return (q.long_term_debt_noncurrent ?? 0) + current;
  }
  if (q.short_term_borrowings !== null) return q.short_term_borrowings;
  return null;
}

export function netDebt(q: QuarterValues): number | null {
  const debt = totalDebt(q);
  return debt === null || q.cash === null ? null : debt - q.cash;
}

export function growth(now: number | null, before: number | null): number | null {
  if (now === null || before === null || before <= 0) return null;
  return now / before - 1;
}

export function ratio(num: number | null, den: number | null): number | null {
  if (num === null || den === null || den <= 0) return null;
  return num / den;
}

/**
 * A per-share dollar figure for display: cents, or three decimals below a
 * cent so NVIDIA's $0.004 split-adjusted dividend does not read "$0.00".
 * Rounds away float noise from derived values (1.7600000000000002 -> $1.76).
 */
export function perShare(v: number): string {
  const abs = Math.abs(v);
  const digits = abs > 0 && abs < 0.01 ? 3 : 2;
  const s = abs.toFixed(digits);
  return `${v < 0 && Number(s) !== 0 ? "-" : ""}$${s}`;
}

export interface TtmSnapshot {
  period_end: string;
  revenue: number | null;
  net_income: number | null;
  operating_income: number | null;
  ebitda: number | null;
  operating_cash_flow: number | null;
  capex: number | null;
  free_cash_flow: number | null;
  dividends_paid: number | null;
  eps: number | null;
  dividends_per_share: number | null;
}

/**
 * TTM figures as of the quarter `offset` back. EPS at a fiscal year end is the
 * reported annual EPS when given (exact); elsewhere the sum of four quarterly
 * EPS figures, which is how TTM EPS is conventionally quoted.
 */
export function ttmSnapshot(rowsNewestFirst: Quarter[], offset = 0, annualEps?: Map<number, number>): TtmSnapshot | null {
  const w = window4(rowsNewestFirst, offset);
  if (!w) return null;
  const opInc = ttm(rowsNewestFirst, "operating_income", offset);
  const da = ttm(rowsNewestFirst, "depreciation_amortization", offset);
  const ocf = ttm(rowsNewestFirst, "operating_cash_flow", offset);
  const capex = ttm(rowsNewestFirst, "capex", offset);
  const latest = w[0];
  const eps =
    latest.fiscal_quarter === 4 && annualEps?.has(latest.fiscal_year)
      ? annualEps.get(latest.fiscal_year)!
      : ttm(rowsNewestFirst, "eps_diluted", offset);
  return {
    period_end: latest.period_end,
    revenue: ttm(rowsNewestFirst, "revenue", offset),
    net_income: ttm(rowsNewestFirst, "net_income", offset),
    operating_income: opInc,
    ebitda: ebitda(opInc, da),
    operating_cash_flow: ocf,
    capex,
    free_cash_flow: freeCashFlow(ocf, capex),
    dividends_paid: ttm(rowsNewestFirst, "dividends_paid", offset),
    eps,
    dividends_per_share: ttm(rowsNewestFirst, "dividends_per_share", offset),
  };
}

/** Latest quarter vs the same quarter a year earlier, for `field`. */
export function quarterYoY(rowsNewestFirst: Quarter[], field: SummedField, offset = 0): number | null {
  const now = rowsNewestFirst[offset];
  const then = rowsNewestFirst[offset + 4];
  if (!now || !then || index(now) - index(then) !== 4) return null;
  return growth(now[field], then[field]);
}

export interface CompanyMetrics {
  asOf: string;
  ttm: TtmSnapshot;
  /** TTM vs the TTM a year earlier. */
  revenueGrowth: number | null;
  netIncomeGrowth: number | null;
  /** Latest quarter's YoY growth, and the quarter before's, for "speeding up / slowing". */
  revenueGrowthLatestQuarter: number | null;
  revenueGrowthPriorQuarter: number | null;
  ebitdaMargin: number | null;
  operatingMargin: number | null;
  netMargin: number | null;
  cash: number | null;
  totalDebt: number | null;
  netDebt: number | null;
  netDebtToEbitda: number | null;
  /** Dividends paid / free cash flow, and / net profit (TTM). */
  payoutOfFcf: number | null;
  payoutOfNetIncome: number | null;
}

export function companyMetrics(rows: Quarter[], annualEps?: Map<number, number>): CompanyMetrics | null {
  const q = sortQuarters(rows);
  const now = ttmSnapshot(q, 0, annualEps);
  if (!now) return null;
  const yearAgo = ttmSnapshot(q, 4, annualEps);
  const latest = q[0];
  const nd = netDebt(latest);
  return {
    asOf: now.period_end,
    ttm: now,
    revenueGrowth: growth(now.revenue, yearAgo?.revenue ?? null),
    netIncomeGrowth: growth(now.net_income, yearAgo?.net_income ?? null),
    revenueGrowthLatestQuarter: quarterYoY(q, "revenue", 0),
    revenueGrowthPriorQuarter: quarterYoY(q, "revenue", 1),
    ebitdaMargin: ratio(now.ebitda, now.revenue),
    operatingMargin: ratio(now.operating_income, now.revenue),
    netMargin: ratio(now.net_income, now.revenue),
    cash: latest.cash,
    totalDebt: totalDebt(latest),
    netDebt: nd,
    netDebtToEbitda: nd === null || now.ebitda === null || now.ebitda <= 0 ? null : nd / now.ebitda,
    payoutOfFcf: ratio(now.dividends_paid, now.free_cash_flow),
    payoutOfNetIncome: ratio(now.dividends_paid, now.net_income),
  };
}

// --------------------------------------------------------------- valuation

export interface PricePoint {
  date: string;
  close: number;
}

/** Close on `date` or the latest session before it; null if none within 7 days. */
export function closeOnOrBefore(pricesAsc: PricePoint[], date: string): PricePoint | null {
  let lo = 0;
  let hi = pricesAsc.length - 1;
  let best: PricePoint | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (pricesAsc[mid].date <= date) {
      best = pricesAsc[mid];
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (!best) return null;
  const gap = (Date.parse(date) - Date.parse(best.date)) / 86_400_000;
  return gap <= 7 ? best : null;
}

export interface PePoint {
  period_end: string;
  price: number;
  eps: number;
  pe: number;
}

export interface PeHistory {
  points: PePoint[];
  /** Mean P/E over the last 5 years of quarter ends (up to 20 points). */
  fiveYearAverage: number | null;
  /** How many quarter ends the average used. */
  count: number;
  current: PePoint | null;
}

/** Fewest quarter ends an average is quoted from; fewer is too thin to compare against. */
export const MIN_PE_POINTS = 8;

/**
 * P/E at each quarter end: the close on (or just before) the quarter end
 * divided by TTM EPS as of that quarter. Quarters with EPS <= 0 have no P/E
 * (a loss has no meaningful multiple) and are left out, not zeroed.
 * `current` uses today's price over the latest TTM EPS.
 */
export function peHistory(rows: Quarter[], pricesAsc: PricePoint[], latestPrice: number | null, annualEps?: Map<number, number>): PeHistory {
  const q = sortQuarters(rows);
  const points: PePoint[] = [];
  for (let offset = 0; offset < 20; offset++) {
    const snap = ttmSnapshot(q, offset, annualEps);
    if (!snap || snap.eps === null || snap.eps <= 0) continue;
    const p = closeOnOrBefore(pricesAsc, snap.period_end);
    if (!p) continue;
    points.push({ period_end: snap.period_end, price: p.close, eps: snap.eps, pe: p.close / snap.eps });
  }
  const count = points.length;
  const fiveYearAverage = count >= MIN_PE_POINTS ? points.reduce((s, p) => s + p.pe, 0) / count : null;
  const latest = ttmSnapshot(q, 0, annualEps);
  const current =
    latest && latest.eps !== null && latest.eps > 0 && latestPrice !== null && latestPrice > 0
      ? { period_end: latest.period_end, price: latestPrice, eps: latest.eps, pe: latestPrice / latest.eps }
      : null;
  return { points, fiveYearAverage, count, current };
}

// ---------------------------------------------------------------- dividends

/**
 * Consecutive fiscal years, counting back from the latest complete one, in
 * which dividends per share rose. A year counts only when all four quarters
 * are present. Returns 0 when the latest year did not rise, and null when
 * fewer than two complete years exist (not enough to say).
 */
export function dividendGrowthYears(rows: Quarter[]): number | null {
  const byYear = new Map<number, number[]>();
  for (const r of rows) {
    if (r.dividends_per_share === null) continue;
    const list = byYear.get(r.fiscal_year) ?? [];
    list.push(r.dividends_per_share);
    byYear.set(r.fiscal_year, list);
  }
  const complete = [...byYear.entries()]
    .filter(([, v]) => v.length === 4)
    .map(([fy, v]) => ({ fy, total: v.reduce((a, b) => a + b, 0) }))
    .sort((a, b) => b.fy - a.fy);
  if (complete.length < 2) return null;
  let years = 0;
  for (let i = 0; i + 1 < complete.length; i++) {
    if (complete[i].fy - complete[i + 1].fy !== 1) break;
    if (complete[i].total > complete[i + 1].total) years++;
    else break;
  }
  return years;
}

// -------------------------------------------------------- earnings reactions

export interface ReleaseDate {
  release_date: string;
  timing: "before_open" | "during_session" | "after_close" | "unknown";
}

export interface EarningsReaction {
  release_date: string;
  /** The session that first traded on the news. */
  reaction_date: string;
  /** Close-to-close move into that session, as a fraction. */
  move: number;
}

/**
 * The first session to trade on each release, and its close-to-close move.
 * After the close -> the next session vs the release day's close. Before the
 * open or during the session -> the release day vs the previous close.
 * "unknown" timing is left out rather than guessed.
 */
export function earningsReactions(releases: ReleaseDate[], pricesAsc: PricePoint[]): EarningsReaction[] {
  const out: EarningsReaction[] = [];
  const idxOnOrAfter = (date: string): number => {
    let lo = 0;
    let hi = pricesAsc.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (pricesAsc[mid].date < date) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  for (const r of releases) {
    if (r.timing === "unknown") continue;
    const i = idxOnOrAfter(r.release_date);
    let react: number;
    if (r.timing === "after_close") {
      // Release day must itself be a session with a close.
      if (pricesAsc[i]?.date !== r.release_date) continue;
      react = i + 1;
    } else {
      react = i;
    }
    const cur = pricesAsc[react];
    const prev = pricesAsc[react - 1];
    if (!cur || !prev || prev.close <= 0) continue;
    // A reaction more than 5 days after the release means the prices have a gap.
    if ((Date.parse(cur.date) - Date.parse(r.release_date)) / 86_400_000 > 5) continue;
    out.push({ release_date: r.release_date, reaction_date: cur.date, move: cur.close / prev.close - 1 });
  }
  return out.sort((a, b) => (a.release_date < b.release_date ? 1 : -1));
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = values.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// ------------------------------------------------------------ applicability

export type CompanyDataStatus = "available" | "not_applicable" | "unavailable";

/**
 * ETFs, funds, crypto, forex and indices have no company filings: their
 * company figures are "not applicable", never zero. An equity with no stored
 * quarters is "unavailable" (not filed with the SEC in us-gaap, e.g. a
 * foreign filer on IFRS, or not ingested yet).
 */
export function companyDataStatus(assetType: string | null | undefined, quarterCount: number): CompanyDataStatus {
  if (assetType !== "equity") return "not_applicable";
  return quarterCount > 0 ? "available" : "unavailable";
}

// ------------------------------------------------------------- use of cash
//
// What a company did with its cash over its last three full fiscal years
// (feat/scorecard-capital-use). Flows come from the 10-K annual figures
// (company_financials_annual); debt from the balance sheet at each fiscal year
// end (the Q4 row of company_financials_quarterly). A use the company's
// filings do not report under a standard tag is null - "not reported" - and
// is never counted as zero: Microsoft's acquisitions since 2023 are filed
// under its own tag and would otherwise read as "spent nothing on
// acquisitions" in the year it bought Activision.

export interface AnnualCapitalRow {
  fiscal_year: number;
  period_end: string;
  revenue: number | null;
  operating_cash_flow: number | null;
  capex: number | null;
  dividends_paid: number | null;
  buybacks: number | null;
  acquisitions: number | null;
  research_development: number | null;
  stock_compensation: number | null;
  diluted_shares: number | null;
}

/** Three full fiscal years are compared: the first with the latest. */
export const CAPITAL_YEARS = 3;

export interface CapitalUse {
  /** Fiscal years covered, oldest first. */
  years: number[];
  firstYear: number;
  lastYear: number;
  /** Free cash flow summed over the years. */
  freeCashFlow: number;
  /** Each use summed over the years; null when any year is not reported. */
  dividends: number | null;
  buybacks: number | null;
  acquisitions: number | null;
  /** Each use as a fraction of the summed free cash flow; null when either side is missing or free cash flow is not positive. */
  dividendsShare: number | null;
  buybacksShare: number | null;
  acquisitionsShare: number | null;
  /** Free cash flow not spent on the three uses; only when all three are reported. */
  leftOver: number | null;
  leftOverShare: number | null;
  /** Diluted weighted-average share count, first and latest year. */
  sharesFirst: number | null;
  sharesLast: number | null;
  shareChange: number | null;
  fcfPerShareFirst: number | null;
  fcfPerShareLast: number | null;
  /** Growth of free cash flow per share; null when the first year's was not positive. */
  fcfPerShareChange: number | null;
  revenuePerShareFirst: number | null;
  revenuePerShareLast: number | null;
  revenuePerShareChange: number | null;
  /** Latest year's R&D / latest year's revenue. */
  rndShareOfSales: number | null;
  /** Stock-based pay summed over the years. */
  stockCompensation: number | null;
  /** Total debt at the end of the year before the window, and at the end of the latest year. */
  debtStart: number | null;
  debtEnd: number | null;
  debtChange: number | null;
}

/** Sum over every row, or null when any row lacks the field. */
function sumAll(rows: AnnualCapitalRow[], f: (r: AnnualCapitalRow) => number | null): number | null {
  let s = 0;
  for (const r of rows) {
    const v = f(r);
    if (v === null || !Number.isFinite(v)) return null;
    s += v;
  }
  return s;
}

/**
 * The last CAPITAL_YEARS consecutive fiscal years with a complete free cash
 * flow, and what happened to it. Null when there are not three such years.
 * `debtAtYearEnd` maps fiscal year -> total debt at that year's end
 * (fundamentals.totalDebt on the Q4 row), null where not reported.
 */
export function capitalUse(annual: AnnualCapitalRow[], debtAtYearEnd: Map<number, number | null>): CapitalUse | null {
  const byYear = [...annual].sort((a, b) => b.fiscal_year - a.fiscal_year);
  const latest = byYear[0];
  if (!latest) return null;
  const window: AnnualCapitalRow[] = [];
  for (const r of byYear) {
    if (window.length === CAPITAL_YEARS) break;
    if (r.fiscal_year !== latest.fiscal_year - window.length) break;
    window.push(r);
  }
  if (window.length < CAPITAL_YEARS) return null;
  window.reverse();
  const fcfOf = (r: AnnualCapitalRow) => freeCashFlow(r.operating_cash_flow, r.capex);
  const fcf = sumAll(window, fcfOf);
  if (fcf === null) return null;

  const first = window[0];
  const last = window[window.length - 1];
  const dividends = sumAll(window, (r) => r.dividends_paid);
  const buybacks = sumAll(window, (r) => r.buybacks);
  const acquisitions = sumAll(window, (r) => r.acquisitions);
  const share = (v: number | null) => (v === null ? null : ratio(v, fcf));
  const leftOver = dividends !== null && buybacks !== null && acquisitions !== null ? fcf - dividends - buybacks - acquisitions : null;

  const perShare = (v: number | null, shares: number | null) => (v === null || shares === null || shares <= 0 ? null : v / shares);
  const fcfFirst = perShare(fcfOf(first), first.diluted_shares);
  const fcfLast = perShare(fcfOf(last), last.diluted_shares);
  const revFirst = perShare(first.revenue, first.diluted_shares);
  const revLast = perShare(last.revenue, last.diluted_shares);

  const debtStart = debtAtYearEnd.get(first.fiscal_year - 1) ?? null;
  const debtEnd = debtAtYearEnd.get(last.fiscal_year) ?? null;

  return {
    years: window.map((r) => r.fiscal_year),
    firstYear: first.fiscal_year,
    lastYear: last.fiscal_year,
    freeCashFlow: fcf,
    dividends,
    buybacks,
    acquisitions,
    dividendsShare: share(dividends),
    buybacksShare: share(buybacks),
    acquisitionsShare: share(acquisitions),
    leftOver,
    leftOverShare: share(leftOver),
    sharesFirst: first.diluted_shares,
    sharesLast: last.diluted_shares,
    shareChange: growth(last.diluted_shares, first.diluted_shares),
    fcfPerShareFirst: fcfFirst,
    fcfPerShareLast: fcfLast,
    fcfPerShareChange: growth(fcfLast, fcfFirst),
    revenuePerShareFirst: revFirst,
    revenuePerShareLast: revLast,
    revenuePerShareChange: growth(revLast, revFirst),
    rndShareOfSales: ratio(last.research_development, last.revenue),
    stockCompensation: sumAll(window, (r) => r.stock_compensation),
    debtStart,
    debtEnd,
    debtChange: debtStart === null || debtEnd === null ? null : debtEnd - debtStart,
  };
}
