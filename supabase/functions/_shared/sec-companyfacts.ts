// Parser for SEC EDGAR's XBRL `companyfacts` API (one call per company:
// https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json) into one row
// per fiscal quarter. Pure: no network, no database, so the edge function
// (ingest-fundamentals) and the test suite run exactly the same code.
//
// HOW A FACT BECOMES A QUARTER
//
// companyfacts repeats a figure in every filing that shows it: a 10-Q carries
// last year's quarter as a comparative, a 10-K carries three years. Each copy
// has `fy`/`fp` of the FILING, not of the period it measures, so `fy`/`fp` are
// not used to place a value. The period comes from the fact's own `start` and
// `end`:
//
//   1. Fiscal years come from 12-month duration facts reported on a 10-K
//      (350-380 days), labelled by their end date (fiscalYearLabel). A year
//      after the latest 10-K is "open" and starts the day after it.
//   2. A duration fact is placed inside the fiscal year that contains it. Its
//      offset from the year start and its length, both in quarters of ~91.3
//      days (52/53-week years included), say what it is: a 3-month quarter,
//      a 6- or 9-month year-to-date figure, or the full year.
//   3. When the same period appears in several filings, the latest-filed
//      value wins (restatements replace originals).
//   4. Quarter values, per concept:
//        reported  a 3-month fact for that quarter;
//        ytd_difference  Q2 = 6-month YTD - Q1, Q3 = 9-month YTD - 6-month YTD.
//          Cash-flow statements in 10-Qs are year-to-date only, so operating
//          cash flow, capital spending, dividends paid and D&A need this.
//        fy_minus_q1_q3  Q4 = full year - Q1 - Q2 - Q3, ONLY when all three
//          are known for the same concept. 10-Ks report the year, not Q4.
//      A derivation never mixes concepts: a year from `Revenues` is never
//      reduced by quarters from `RevenueFromContractWithCustomer...`.
//      Q4 EPS derived this way is approximate (share counts move during the
//      year) and is marked so; TTM EPS at a fiscal year end uses the reported
//      annual EPS instead.
//   5. Balance-sheet figures (cash, debt) are instants, matched to each
//      quarter's end date within 5 days.
//   6. Fallback chains are applied per period: a company that reported
//      `SalesRevenueNet` until 2018 and `RevenueFromContract...` after gets
//      both eras.
//
// Nothing is estimated. A quarter with no fact and no allowed derivation is
// null, and its provenance says so.

export interface XbrlFact {
  start?: string;
  end: string;
  val: number;
  accn: string;
  fy?: number | null;
  fp?: string | null;
  form: string;
  filed: string;
  frame?: string;
}

export interface CompanyFacts {
  cik: number | string;
  entityName?: string;
  facts?: {
    "us-gaap"?: Record<string, { units?: Record<string, XbrlFact[]> }>;
    [taxonomy: string]: Record<string, { units?: Record<string, XbrlFact[]> }> | undefined;
  };
}

type Kind = "duration" | "instant";

interface FieldSpec {
  kind: Kind;
  unit: "USD" | "USD/shares";
  chain: string[];
}

/**
 * Every field Cairn stores, with the us-gaap concepts tried in order.
 * `dividends_per_share` and the short-term debt concepts are additions to the
 * brief's list: years of dividend growth need a per-share figure (total cash
 * paid moves with buybacks), and total debt needs short-term borrowings.
 */
export const FIELD_SPECS = {
  revenue: {
    kind: "duration",
    unit: "USD",
    chain: ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "SalesRevenueNet"],
  },
  net_income: { kind: "duration", unit: "USD", chain: ["NetIncomeLoss"] },
  operating_income: { kind: "duration", unit: "USD", chain: ["OperatingIncomeLoss"] },
  // `Depreciation` is last: Microsoft and Tesla file their cash-flow D&A
  // line under a company-specific tag, so plain depreciation is the only
  // us-gaap figure. It leaves out amortisation of intangibles, so EBITDA from
  // it is slightly understated (the cautious direction); provenance names the
  // concept used.
  depreciation_amortization: {
    kind: "duration",
    unit: "USD",
    chain: ["DepreciationDepletionAndAmortization", "DepreciationAndAmortization", "Depreciation"],
  },
  operating_cash_flow: { kind: "duration", unit: "USD", chain: ["NetCashProvidedByUsedInOperatingActivities"] },
  // NVIDIA, Amazon, Intuitive Surgical and Kratos report capital spending as
  // PaymentsToAcquireProductiveAssets ("purchases related to property and
  // equipment and intangible assets"); without it they had no free cash flow.
  capex: { kind: "duration", unit: "USD", chain: ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"] },
  dividends_paid: { kind: "duration", unit: "USD", chain: ["PaymentsOfDividends", "PaymentsOfDividendsCommonStock"] },
  eps_diluted: { kind: "duration", unit: "USD/shares", chain: ["EarningsPerShareDiluted"] },
  dividends_per_share: {
    kind: "duration",
    unit: "USD/shares",
    chain: ["CommonStockDividendsPerShareDeclared", "CommonStockDividendsPerShareCashPaid"],
  },
  cash: { kind: "instant", unit: "USD", chain: ["CashAndCashEquivalentsAtCarryingValue"] },
  // Debt, stored as components. In the us-gaap taxonomy `LongTermDebt`
  // already INCLUDES its current portion, so the brief's "LongTermDebt +
  // LongTermDebtCurrent" would count current maturities twice. Total debt is
  // computed in src/lib/fundamentals.ts (totalDebt) from these.
  long_term_debt: { kind: "instant", unit: "USD", chain: ["LongTermDebt"] },
  long_term_debt_noncurrent: { kind: "instant", unit: "USD", chain: ["LongTermDebtNoncurrent"] },
  long_term_debt_current: { kind: "instant", unit: "USD", chain: ["LongTermDebtCurrent"] },
  debt_current: { kind: "instant", unit: "USD", chain: ["DebtCurrent"] },
  short_term_borrowings: { kind: "instant", unit: "USD", chain: ["ShortTermBorrowings", "CommercialPaper"] },
} as const satisfies Record<string, FieldSpec>;

export type Field = keyof typeof FIELD_SPECS;
export const FIELDS = Object.keys(FIELD_SPECS) as Field[];

export type Method = "reported" | "ytd_difference" | "fy_minus_q1_q3";

export interface Provenance {
  concept: string;
  method: Method;
  /** Accession number and form of the filing the (last) input came from. */
  accn: string;
  form: string;
  filed: string;
  /** Set when a derivation is not exact (Q4 EPS). */
  approximate?: boolean;
  /**
   * Set when a derived per-share value was impossible and not stored: EPS
   * below zero in a quarter with positive net income, or a negative dividend.
   * The value is null and this says what it came out as.
   */
  rejected?: string;
}

export interface QuarterRow {
  fiscal_year: number;
  fiscal_quarter: 1 | 2 | 3 | 4;
  period_start: string;
  period_end: string;
  values: Record<Field, number | null>;
  provenance: Partial<Record<Field, Provenance>>;
}

export interface AnnualRow {
  fiscal_year: number;
  period_start: string;
  period_end: string;
  /** Reported full-year figures (10-K), for fields where a year makes sense. */
  values: Partial<Record<Field, number | null>>;
}

export interface ParsedCompany {
  cik: string;
  entityName: string | null;
  quarters: QuarterRow[];
  annual: AnnualRow[];
  /** Share splits found in the filings; every per-share figure above is on the latest filing's basis. */
  splits: SplitEvent[];
}

// ------------------------------------------------------------------ dates

const DAY = 86_400_000;
const QUARTER_DAYS = 365.25 / 4;

function t(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`);
}
function days(a: string, b: string): number {
  return Math.round((t(b) - t(a)) / DAY);
}
function addDays(iso: string, n: number): string {
  return new Date(t(iso) + n * DAY).toISOString().slice(0, 10);
}

const ANNUAL_FORMS = new Set(["10-K", "10-K/A", "10-KT", "10-KT/A"]);
const PERIODIC_FORMS = new Set(["10-Q", "10-Q/A", ...ANNUAL_FORMS]);

// ------------------------------------------------------------- the calendar

interface FiscalYear {
  fy: number;
  start: string;
  end: string;
  /** True for the year after the latest 10-K, which has no annual fact yet. */
  open: boolean;
}

function conceptFacts(doc: CompanyFacts, concept: string, unit: string): XbrlFact[] {
  const list = doc.facts?.["us-gaap"]?.[concept]?.units?.[unit] ?? [];
  return list.filter(
    (f) => f && typeof f.val === "number" && Number.isFinite(f.val) && typeof f.end === "string" && PERIODIC_FORMS.has(f.form),
  );
}

/**
 * Fiscal years from every 12-month fact reported on a 10-K, across all
 * duration concepts.
 *
 * The label comes from the year-end date, not the fact's `fy`: `fy` belongs to
 * the filing, so a year that only appears as a comparative in a later 10-K
 * would carry the later year's label. The year of the end date is the label
 * companies use (NVIDIA's fiscal 2026 ends 25 Jan 2026; Microsoft's fiscal
 * 2026 ends 30 Jun 2026), except that a 52/53-week year ending in the first
 * ten days of January belongs to the year before.
 */
export function fiscalYearLabel(end: string): number {
  const year = Number(end.slice(0, 4));
  return end.slice(5, 7) === "01" && Number(end.slice(8, 10)) <= 10 ? year - 1 : year;
}

export function fiscalYears(doc: CompanyFacts): FiscalYear[] {
  const byEnd = new Map<string, { start: string; end: string; fy: number; filed: string }>();
  // Fiscal years from every 12-month fact reported on a 10-K; see fiscalYearLabel.
  for (const field of FIELDS) {
    const spec = FIELD_SPECS[field];
    if (spec.kind !== "duration") continue;
    for (const concept of spec.chain) {
      for (const f of conceptFacts(doc, concept, spec.unit)) {
        if (!f.start || !ANNUAL_FORMS.has(f.form)) continue;
        const len = days(f.start, f.end);
        if (len < 350 || len > 380) continue;
        const key = [...byEnd.keys()].find((k) => Math.abs(days(k, f.end)) <= 7) ?? f.end;
        const prev = byEnd.get(key);
        const fy = fiscalYearLabel(f.end);
        if (!prev || f.filed < prev.filed) byEnd.set(key, { start: f.start, end: f.end, fy, filed: f.filed });
      }
    }
  }
  const years = [...byEnd.values()]
    .sort((a, b) => (a.end < b.end ? -1 : 1))
    .map((y) => ({ fy: y.fy, start: y.start, end: y.end, open: false }));


  const last = years[years.length - 1];
  if (last) {
    const start = addDays(last.end, 1);
    years.push({ fy: last.fy + 1, start, end: addDays(start, 364), open: true });
  }
  return years;
}

interface Placed {
  fact: XbrlFact;
  year: FiscalYear;
  /** Quarter the fact starts in, 0-based. */
  offset: number;
  /** Length in quarters (1, 2, 3 or 4). */
  length: number;
}

function place(f: XbrlFact, years: FiscalYear[]): Placed | null {
  if (!f.start) return null;
  const year = years.find((y) => days(y.start, f.start!) >= -10 && days(f.end, y.end) >= -10);
  if (!year) return null;
  const offset = Math.round(days(year.start, f.start) / QUARTER_DAYS);
  const length = Math.round((days(f.start, f.end) + 1) / QUARTER_DAYS);
  if (length < 1 || length > 4 || offset < 0 || offset + length > 4) return null;
  return { fact: f, year, offset, length };
}

/** Latest-filed fact per exact (start, end). */
function latestFiled(facts: XbrlFact[]): XbrlFact[] {
  const best = new Map<string, XbrlFact>();
  for (const f of facts) {
    const key = `${f.start ?? ""}|${f.end}`;
    const prev = best.get(key);
    if (!prev || f.filed > prev.filed || (f.filed === prev.filed && f.accn > prev.accn)) best.set(key, f);
  }
  return [...best.values()];
}

// ----------------------------------------------------------- share splits
//
// A filing reports every per-share figure on the share count at the time it
// was issued: after a split, companies restate earlier periods on the new
// count. Keeping the latest-filed copy of each period therefore mixes bases:
// NVIDIA's FY2024 Q1 EPS was last filed in May 2024 (0.82, before its
// 10-for-1 split) while FY2024 itself was restated in 2025 (1.19), so
// Q4 = FY - Q1 - Q2 - Q3 came out at -0.25.
//
// The split history comes from the filings themselves. When two filings
// report the same period's per-share figure and one is a clean split ratio of
// the other (2, 3, 4, 10, 20, 1.5, ... or the reverse, within the rounding of
// the reported digits), the two filings are on bases that differ by that
// ratio; an equal figure says the same basis. Solving those links (a weighted
// union-find, most precise figures first) gives every filing a scale to the
// latest filing's basis. A ratio has to be seen on at least two periods to
// count as a split: one period restated by a clean-looking ratio is more
// likely a restatement for another reason (discontinued operations). A filing
// that cannot be linked to the latest one is not guessed at: its per-share
// facts are dropped when the filings either side of it disagree on the basis.
//
// Cover-page share counts (dei:EntityCommonStockSharesOutstanding) were
// considered and not used: dual-class companies (Alphabet) report none, and
// share issuance for acquisitions produces jumps that look like splits.

export interface SplitEvent {
  /** New shares per old share: 10 for NVIDIA's 2024 split, 0.1 for a 1-for-10 reverse split. */
  ratio: number;
  /** Filed date of the last filing on the old basis. */
  lastOldBasis: string;
  /** Filed date of the first filing on the new basis. */
  firstNewBasis: string;
}

const SPLIT_RATIOS = [1.5, 2, 2.5, 3, 4, 5, 6, 7, 8, 10, 12, 15, 20, 25, 30, 40, 50, 100];
const BASIS_RATIOS = [1, ...SPLIT_RATIOS, ...SPLIT_RATIOS.map((r) => 1 / r)];

/** Half a unit of the last digit SEC reported: 0.82 is 0.815-0.825. */
function halfUnit(v: number): number {
  const s = String(Math.abs(v));
  if (s.includes("e")) return Math.abs(v) * 1e-6;
  const dot = s.indexOf(".");
  return 0.5 * 10 ** -(dot < 0 ? 0 : s.length - dot - 1);
}

/**
 * The one ratio r with earlier ~= r * later given each figure's rounding, or
 * null when none fits or several do (0.01 vs 0.01 fits 1 and 2 alike).
 */
function basisRatio(earlier: number, later: number): number | null {
  if (earlier === 0 || later === 0 || Math.sign(earlier) !== Math.sign(later)) return null;
  const a = Math.abs(earlier);
  const b = Math.abs(later);
  const ha = halfUnit(earlier);
  const hb = halfUnit(later);
  const fits = BASIS_RATIOS.filter((r) => Math.abs(a / r - b) <= ha / r + hb + 1e-12);
  return fits.length === 1 ? fits[0] : null;
}

const round6 = (v: number) => Math.round(v * 1e6) / 1e6;

interface ShareBasis {
  /** Multiplier from a filing's per-share figures to the latest basis; absent = unknown. */
  scale: Map<string, number>;
  splits: SplitEvent[];
}

export function shareBasis(doc: CompanyFacts): ShareBasis {
  const filedOf = new Map<string, string>();
  interface Link {
    a: string;
    b: string;
    period: string;
    ratio: number;
    filedA: string;
    filedB: string;
    weight: number;
  }
  const links: Link[] = [];
  for (const [concept, entry] of Object.entries(doc.facts?.["us-gaap"] ?? {})) {
    for (const f of entry?.units?.["USD/shares"] ?? []) {
      if (f && PERIODIC_FORMS.has(f.form) && typeof f.val === "number") filedOf.set(f.accn, f.filed);
    }
    const byPeriod = new Map<string, XbrlFact[]>();
    for (const f of conceptFacts(doc, concept, "USD/shares")) {
      const key = `${f.start ?? ""}|${f.end}`;
      const list = byPeriod.get(key) ?? [];
      if (!list.some((g) => g.accn === f.accn)) list.push(f);
      byPeriod.set(key, list);
    }
    for (const [period, list] of byPeriod) {
      list.sort((x, y) => (x.filed < y.filed ? -1 : x.filed > y.filed ? 1 : 0));
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const x = list[i];
          const y = list[j];
          const ratio = basisRatio(x.val, y.val);
          if (ratio === null) continue;
          // Precision of the link: how many rounding units the smaller figure spans.
          const weight = Math.min(Math.abs(x.val) / halfUnit(x.val), Math.abs(y.val) / halfUnit(y.val));
          links.push({ a: x.accn, b: y.accn, period: `${concept}|${period}`, ratio, filedA: x.filed, filedB: y.filed, weight });
        }
      }
    }
  }

  // A split ratio seen on only one period, with no other link of that ratio
  // overlapping it in time, is not trusted.
  const splitLinks = links.filter((l) => l.ratio !== 1);
  const trusted = links.filter((l) => {
    if (l.ratio === 1) return true;
    const periods = new Set(
      splitLinks.filter((m) => m.ratio === l.ratio && m.filedA < l.filedB && l.filedA < m.filedB).map((m) => m.period),
    );
    return periods.size >= 2;
  });

  // Weighted union-find in log space: pot(x) = log(scale(x) / scale(root)).
  const parent = new Map<string, string>();
  const pot = new Map<string, number>();
  const find = (x: string): string => {
    if (!parent.has(x)) {
      parent.set(x, x);
      pot.set(x, 0);
    }
    const p = parent.get(x)!;
    if (p === x) return x;
    const root = find(p);
    pot.set(x, pot.get(x)! + pot.get(p)!);
    parent.set(x, root);
    return root;
  };
  for (const l of trusted.sort((x, y) => y.weight - x.weight)) {
    // valA * scaleA = valB * scaleB and valA = ratio * valB, so
    // log scaleA - log scaleB = -log ratio.
    const d = -Math.log(l.ratio);
    const ra = find(l.a);
    const rb = find(l.b);
    if (ra === rb) continue; // already fixed by more precise links
    parent.set(ra, rb);
    pot.set(ra, pot.get(l.b)! + d - pot.get(l.a)!);
  }

  const accns = [...filedOf.keys()].sort((x, y) => (filedOf.get(x)! < filedOf.get(y)! ? -1 : filedOf.get(x)! > filedOf.get(y)! ? 1 : 0));
  const scale = new Map<string, number>();
  const splits: SplitEvent[] = [];
  const anchor = accns[accns.length - 1];
  if (!anchor) return { scale, splits };
  const anchorRoot = find(anchor);
  // Products of the ratios above; toPrecision drops the float noise of exp/log.
  const snap = (v: number) => Number(v.toPrecision(10));
  const linked: string[] = [];
  for (const x of accns) {
    if (find(x) !== anchorRoot) continue;
    scale.set(x, snap(Math.exp(pot.get(x)! - pot.get(anchor)!)));
    linked.push(x);
  }
  for (let i = 1; i < linked.length; i++) {
    const s0 = scale.get(linked[i - 1])!;
    const s1 = scale.get(linked[i])!;
    if (s0 !== s1) {
      const r = s1 / s0;
      splits.push({ ratio: r >= 1 ? Math.round(r * 100) / 100 : Math.round(r * 10000) / 10000, lastOldBasis: filedOf.get(linked[i - 1])!, firstNewBasis: filedOf.get(linked[i])! });
    }
  }
  // A filing that shares no period with the others takes the basis of the
  // linked filings of its era. Filed inside a split's window (after the last
  // old-basis filing, before the first new-basis one) it stays unknown.
  for (const x of accns) {
    if (scale.has(x)) continue;
    const filed = filedOf.get(x)!;
    if (splits.some((s) => filed > s.lastOldBasis && filed < s.firstNewBasis)) continue;
    const era = [...linked].reverse().find((y) => filedOf.get(y)! <= filed) ?? linked[0];
    scale.set(x, scale.get(era)!);
  }
  return { scale, splits };
}

/**
 * The same document with every per-share fact on the latest filing's basis.
 * Facts from a filing whose basis is unknown are left out, so a quarter can
 * never be built from two bases.
 */
export function splitAdjusted(doc: CompanyFacts): { doc: CompanyFacts; splits: SplitEvent[] } {
  const usGaap = doc.facts?.["us-gaap"];
  if (!usGaap) return { doc, splits: [] };
  const { scale, splits } = shareBasis(doc);
  const out: NonNullable<CompanyFacts["facts"]>["us-gaap"] = {};
  for (const [concept, entry] of Object.entries(usGaap)) {
    const perShare = entry?.units?.["USD/shares"];
    if (!perShare) {
      out[concept] = entry;
      continue;
    }
    const adjusted = perShare.flatMap((f) => {
      const s = scale.get(f.accn);
      if (s === undefined) return [];
      return [s === 1 ? f : { ...f, val: round6(f.val * s) }];
    });
    out[concept] = { ...entry, units: { ...entry.units, "USD/shares": adjusted } };
  }
  return { doc: { ...doc, facts: { ...doc.facts, "us-gaap": out } }, splits };
}

/**
 * Last-12-months per-share figure from parsed quarters: the screener's
 * `fundamentals.eps_ttm` and `dividends_ttm`. The four newest quarters must
 * be consecutive and all known; Q4 comes from the year (10-Ks report no
 * 3-month Q4), and a missing quarter gives null rather than a 3-quarter sum.
 */
export function trailingPerShare(parsed: ParsedCompany, field: "eps_diluted" | "dividends_per_share"): number | null {
  const newest = [...parsed.quarters].sort((a, b) => (a.period_end < b.period_end ? 1 : -1)).slice(0, 4);
  if (newest.length < 4) return null;
  for (let i = 1; i < 4; i++) {
    const gap = days(newest[i].period_end, newest[i - 1].period_end);
    if (gap < 80 || gap > 100) return null;
  }
  const vals = newest.map((q) => q.values[field]);
  if (vals.some((v) => v === null)) return null;
  return round6((vals as number[]).reduce((a, b) => a + b, 0));
}

// ------------------------------------------------------------- one concept

interface ConceptQuarters {
  /** fy -> quarter (1-4) -> value + provenance */
  q: Map<number, Map<number, { val: number; prov: Provenance; start: string; end: string }>>;
  annual: Map<number, { val: number; fact: XbrlFact }>;
}

function prov(concept: string, method: Method, f: XbrlFact, approximate = false): Provenance {
  return { concept, method, accn: f.accn, form: f.form, filed: f.filed, ...(approximate ? { approximate } : {}) };
}

function durationQuarters(doc: CompanyFacts, concept: string, unit: string, years: FiscalYear[]): ConceptQuarters {
  const placed = latestFiled(conceptFacts(doc, concept, unit))
    .map((f) => place(f, years))
    .filter((p): p is Placed => p !== null);

  const q: ConceptQuarters["q"] = new Map();
  const annual: ConceptQuarters["annual"] = new Map();
  const ytd = new Map<number, Map<number, XbrlFact>>();

  for (const p of placed) {
    if (p.length === 1) {
      const m = q.get(p.year.fy) ?? new Map();
      m.set(p.offset + 1, { val: p.fact.val, prov: prov(concept, "reported", p.fact), start: p.fact.start!, end: p.fact.end });
      q.set(p.year.fy, m);
    } else if (p.offset === 0 && p.length === 4) {
      if (!p.year.open) annual.set(p.year.fy, { val: p.fact.val, fact: p.fact });
    } else if (p.offset === 0) {
      const m = ytd.get(p.year.fy) ?? new Map();
      m.set(p.length, p.fact);
      ytd.set(p.year.fy, m);
    }
  }

  const isEps = unit === "USD/shares";
  for (const year of years) {
    const m = q.get(year.fy) ?? new Map();
    const y = ytd.get(year.fy) ?? new Map<number, XbrlFact>();
    // Q2 and Q3 from year-to-date figures where no 3-month fact exists.
    // Per-share figures are not differenced: EPS over 6 months minus EPS over
    // 3 months is not the second quarter's EPS when the share count moved.
    if (!isEps) {
      const q1 = m.get(1);
      if (!m.has(2) && y.has(2) && q1) {
        const six = y.get(2)!;
        m.set(2, { val: six.val - q1.val, prov: prov(concept, "ytd_difference", six), start: addDays(q1.end, 1), end: six.end });
      }
      if (!m.has(3) && y.has(3)) {
        const nine = y.get(3)!;
        const six = y.get(2);
        const q2 = m.get(2);
        const q1b = m.get(1);
        const through6 = six ? six.val : q1b && q2 ? q1b.val + q2.val : null;
        const q2End = six?.end ?? q2?.end;
        if (through6 !== null && q2End) {
          m.set(3, { val: nine.val - through6, prov: prov(concept, "ytd_difference", nine), start: addDays(q2End, 1), end: nine.end });
        }
      }
    }
    // Q4 = year - Q1 - Q2 - Q3, only with all three.
    const a = annual.get(year.fy);
    if (a && !m.has(4) && m.has(1) && m.has(2) && m.has(3)) {
      const sum = m.get(1)!.val + m.get(2)!.val + m.get(3)!.val;
      m.set(4, {
        val: isEps ? round6(a.val - sum) : a.val - sum,
        prov: prov(concept, "fy_minus_q1_q3", a.fact, isEps),
        start: addDays(m.get(3)!.end, 1),
        end: a.fact.end,
      });
    }
    if (m.size > 0) q.set(year.fy, m);
  }
  return { q, annual };
}

// ---------------------------------------------------------------- the parse

function emptyValues(): Record<Field, number | null> {
  return Object.fromEntries(FIELDS.map((f) => [f, null])) as Record<Field, number | null>;
}

export function parseCompanyFacts(raw: CompanyFacts): ParsedCompany {
  const cik = String(raw.cik).padStart(10, "0");
  // Every per-share figure onto the latest filing's share basis first, so no
  // quarter or year below is ever built from two bases (see shareBasis).
  const { doc, splits } = splitAdjusted(raw);
  const years = fiscalYears(doc);

  // Duration fields, per concept, then the chain chooses per quarter.
  const byField = new Map<Field, ConceptQuarters[]>();
  for (const field of FIELDS) {
    const spec = FIELD_SPECS[field];
    if (spec.kind !== "duration") continue;
    byField.set(
      field,
      spec.chain.map((c) => durationQuarters(doc, c, spec.unit, years)),
    );
  }

  // The quarter calendar: every (fy, q) any duration field produced.
  const calendar = new Map<string, { fy: number; q: number; start: string; end: string }>();
  for (const perConcept of byField.values()) {
    for (const cq of perConcept) {
      for (const [fy, m] of cq.q) {
        for (const [qn, v] of m) {
          const key = `${fy}-${qn}`;
          const prev = calendar.get(key);
          // Prefer a reported quarter's own dates over derived ones.
          if (!prev || v.prov.method === "reported") calendar.set(key, { fy, q: qn, start: v.start, end: v.end });
        }
      }
    }
  }

  // Instants: latest-filed value per end date, per concept.
  const instants = new Map<string, XbrlFact[]>();
  for (const field of FIELDS) {
    const spec = FIELD_SPECS[field];
    if (spec.kind !== "instant") continue;
    for (const concept of spec.chain) instants.set(concept, latestFiled(conceptFacts(doc, concept, spec.unit)));
  }
  const instantAt = (concept: string, end: string): XbrlFact | null => {
    const list = instants.get(concept) ?? [];
    let best: XbrlFact | null = null;
    for (const f of list) {
      if (Math.abs(days(f.end, end)) > 5) continue;
      if (!best || Math.abs(days(f.end, end)) < Math.abs(days(best.end, end)) || f.filed > best.filed) best = f;
    }
    return best;
  };

  const quarters: QuarterRow[] = [];
  for (const { fy, q, start, end } of [...calendar.values()].sort((a, b) => (a.end < b.end ? -1 : 1))) {
    const values = emptyValues();
    const provenance: QuarterRow["provenance"] = {};
    for (const field of FIELDS) {
      const spec = FIELD_SPECS[field];
      if (spec.kind === "duration") {
        const perConcept = byField.get(field)!;
        for (const cq of perConcept) {
          const v = cq.q.get(fy)?.get(q);
          if (v) {
            values[field] = v.val;
            provenance[field] = v.prov;
            break;
          }
        }
      } else {
        for (const concept of spec.chain) {
          const f = instantAt(concept, end);
          if (f) {
            values[field] = f.val;
            provenance[field] = prov(concept, "reported", f);
            break;
          }
        }
      }
    }
    // A derived per-share figure that cannot be true is not stored: a loss per
    // share in a quarter that made money, or a negative dividend. Both are
    // what inconsistent inputs look like (a basis or restatement mismatch),
    // and one bad quarter poisons every trailing-12-month figure it is in.
    const reject = (field: "eps_diluted" | "dividends_per_share", why: string) => {
      const p = provenance[field];
      if (!p || p.method === "reported") return;
      provenance[field] = { ...p, rejected: `${why}: derived ${values[field]}` };
      values[field] = null;
    };
    if (values.eps_diluted !== null && values.eps_diluted < 0 && values.net_income !== null && values.net_income > 0) {
      reject("eps_diluted", "negative EPS with positive net income");
    }
    if (values.dividends_per_share !== null && values.dividends_per_share < 0) reject("dividends_per_share", "negative dividend per share");
    quarters.push({ fiscal_year: fy, fiscal_quarter: q as 1 | 2 | 3 | 4, period_start: start, period_end: end, values, provenance });
  }

  const annual: AnnualRow[] = years
    .filter((y) => !y.open)
    .map((y) => {
      const values: AnnualRow["values"] = {};
      for (const field of FIELDS) {
        const spec = FIELD_SPECS[field];
        if (spec.kind !== "duration") continue;
        for (const cq of byField.get(field)!) {
          const a = cq.annual.get(y.fy);
          if (a) {
            values[field] = a.val;
            break;
          }
        }
      }
      return { fiscal_year: y.fy, period_start: y.start, period_end: y.end, values };
    });

  return { cik, entityName: doc.entityName ?? null, quarters, annual, splits };
}

// ------------------------------------------------------- earnings releases

export interface Submissions {
  cik?: string | number;
  filings?: {
    recent?: {
      accessionNumber?: string[];
      form?: string[];
      filingDate?: string[];
      acceptanceDateTime?: string[];
      items?: string[];
    };
  };
}

export interface EarningsRelease {
  accn: string;
  release_date: string;
  accepted_at: string | null;
  /**
   * Which session first trades on the news, from the acceptance time in US
   * Eastern: after 16:00 -> "after_close" (next session reacts), before 09:30
   * -> "before_open" (same session reacts), otherwise "during_session".
   */
  timing: "before_open" | "during_session" | "after_close" | "unknown";
}

/** Hour and minute in America/New_York for an ISO instant. */
function easternHm(iso: string): { h: number; m: number; date: string } | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { h: Number(get("hour")), m: Number(get("minute")), date: `${get("year")}-${get("month")}-${get("day")}` };
}

/**
 * Earnings press releases: 8-K filings carrying item 2.02 ("Results of
 * Operations and Financial Condition"), from the submissions feed the ingest
 * already reads. Deeper and exact-to-the-minute compared with the four
 * quarters Nasdaq's earnings-surprise endpoint returns.
 */
export function parseEarningsReleases(sub: Submissions): EarningsRelease[] {
  const r = sub.filings?.recent;
  if (!r?.form || !r.accessionNumber || !r.filingDate) return [];
  const out: EarningsRelease[] = [];
  for (let i = 0; i < r.form.length; i++) {
    // Originals only: an 8-K/A corrects a release already counted, and is
    // often filed a day or more later, which would count it twice.
    if (r.form[i] !== "8-K") continue;
    const items = (r.items?.[i] ?? "").split(",").map((s) => s.trim());
    if (!items.includes("2.02")) continue;
    const accepted = r.acceptanceDateTime?.[i] ?? null;
    const et = accepted ? easternHm(accepted) : null;
    let timing: EarningsRelease["timing"] = "unknown";
    let date = r.filingDate[i];
    if (et) {
      const mins = et.h * 60 + et.m;
      timing = mins >= 16 * 60 ? "after_close" : mins < 9 * 60 + 30 ? "before_open" : "during_session";
      date = et.date;
    }
    out.push({ accn: r.accessionNumber[i], release_date: date, accepted_at: accepted, timing });
  }
  // Two item-2.02 8-Ks on one day are one release.
  const byDate = new Map<string, EarningsRelease>();
  for (const e of out) if (!byDate.has(e.release_date)) byDate.set(e.release_date, e);
  return [...byDate.values()].sort((a, b) => (a.release_date < b.release_date ? 1 : -1));
}

// ------------------------------------------------------------ stored rows

/**
 * The rows one company's filings become: company_financials_quarterly,
 * company_financials_annual and earnings_releases. Shared by the weekly
 * ingest-fundamentals Edge Function and the on-demand path the analysis runs
 * for a share nobody has analysed yet (src/lib/market-data/company-data.ts),
 * so the two can never store the same filing differently.
 */
export function secHistoryRows(
  symbol: string,
  cik: string,
  parsed: ParsedCompany | null,
  releases: EarningsRelease[],
  now: string,
): { quarters: Record<string, unknown>[]; annual: Record<string, unknown>[]; releases: Record<string, unknown>[] } {
  return {
    quarters: (parsed?.quarters ?? []).map((q) => ({
      symbol,
      cik,
      fiscal_year: q.fiscal_year,
      fiscal_quarter: q.fiscal_quarter,
      period_start: q.period_start,
      period_end: q.period_end,
      ...q.values,
      provenance: q.provenance,
      updated_at: now,
    })),
    annual: (parsed?.annual ?? []).map((a) => ({
      symbol,
      cik,
      fiscal_year: a.fiscal_year,
      period_start: a.period_start,
      period_end: a.period_end,
      ...Object.fromEntries(FIELDS.filter((f) => f in a.values).map((f) => [f, a.values[f] ?? null])),
      updated_at: now,
    })),
    releases: releases.map((r) => ({ symbol, cik, ...r, updated_at: now })),
  };
}

/** The newest reported shares-outstanding figure in a companyfacts document (us-gaap, then dei). */
export function latestSharesOutstanding(doc: CompanyFacts | null): { end: string; val: number } | null {
  const pick = (facts: XbrlFact[] | undefined) =>
    [...(facts ?? [])].filter((f) => typeof f.val === "number" && typeof f.end === "string").sort((a, b) => (a.end < b.end ? 1 : -1))[0] ?? null;
  const f = doc?.facts as Record<string, Record<string, { units?: Record<string, XbrlFact[]> }> | undefined> | undefined;
  const hit = pick(f?.["us-gaap"]?.CommonStockSharesOutstanding?.units?.shares) ?? pick(f?.dei?.EntityCommonStockSharesOutstanding?.units?.shares);
  return hit ? { end: hit.end, val: hit.val } : null;
}
