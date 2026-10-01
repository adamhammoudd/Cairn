// Everything the top of the ticker page shows, assembled on the server:
// the plain summary, the scorecard, "What history says", the company-numbers
// table and (behind a flag) "What this means for you".
//
// Order of preference, so a number is never regenerated per view:
//   * summary and history: the ones stored with the latest analysis
//     (ai_analyses.plain_summary, migration 0049); otherwise the template
//     built from today's scorecard, and history counted from that analysis's
//     own stored analogs;
//   * scorecard: always today's, from stored filings and prices.
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLatestCloses } from "@/lib/market-data/current-price";
import { loadScorecard } from "@/lib/scorecard-data";
import { historyInPlainWords, type HistoryPlain } from "@/lib/ai/history-plain";
import { templateSummary, type SummaryText } from "@/lib/ai/plain-summary";
import { FACTOR_FORWARD_SESSIONS } from "@/lib/ai/factors";
import { FACTOR_EVENT_TYPE } from "@/lib/ai/factor-analysis";
import { ebitda, freeCashFlow, median, totalDebt, type Quarter } from "@/lib/fundamentals";
import { exposureFacts, isExposureEnabled, type ExposureFacts } from "@/lib/exposure";
import type { Scorecard } from "@/lib/scorecard";
import type { AnalysisWithMethodology } from "@/lib/actions/analysis";
import { weekAgoLevels } from "@/lib/daily-briefing-data";
import { scorecardChanges } from "@/lib/daily-briefing";

export interface CompanyNumbersRow {
  label: string;
  periodEnd: string;
  revenue: number | null;
  netIncome: number | null;
  ebitda: number | null;
  freeCashFlow: number | null;
  cash: number | null;
  debt: number | null;
  eps: number | null;
  /** True when any figure in the row was derived (Q4 from the year, or a year-to-date difference). */
  derived: boolean;
  filingUrl: string | null;
  filingLabel: string | null;
  /** company_financials_quarterly.currency: the currency the quarter was FILED in, never converted. */
  currency: string;
}

export interface AnalysisSummaryView {
  symbol: string;
  name: string;
  assetType: string | null;
  scorecard: Scorecard;
  summary: SummaryText & { source: "model" | "template"; writtenAt: string | null; fromAnalysis: boolean };
  history: HistoryPlain | null;
  historyAsOf: string | null;
  companyStatus: "available" | "not_applicable" | "unavailable";
  companyNumbers: CompanyNumbersRow[];
  medianEarningsMove: number | null;
  exposure: ExposureFacts | null;
  /** The reader's plan, decided on the server (getUserPlan). */
  plan: "free" | "premium";
  /** True on Free: the quarterly company table is Premium and is not in this payload. */
  companyLocked: boolean;
}

interface StoredSummary {
  version: number;
  headline: string;
  bullets: string[];
  source: "model" | "template";
  generatedAt: string;
  history: HistoryPlain | null;
}

function storedSummary(a: AnalysisWithMethodology | null): StoredSummary | null {
  const raw = (a as unknown as { plain_summary?: unknown } | null)?.plain_summary;
  if (!raw || typeof raw !== "object") return null;
  const s = raw as StoredSummary;
  return s.version === 1 && typeof s.headline === "string" && Array.isArray(s.bullets) ? s : null;
}

/** History counted from the analysis's own stored factor analogs. */
async function historyFromAnalysis(analysisId: string, name: string, assetType: string | null): Promise<HistoryPlain | null> {
  // Admin read: only the aggregate (counts and dots) reaches the page; the
  // per-case rows stay behind the plan gate in attachMethodology().
  const admin = createAdminClient();
  const { data } = await admin
    .from("ai_analysis_historical_analogs")
    .select("historical_events!inner(event_type, event_date, price_before, price_after)")
    .eq("analysis_id", analysisId);
  const rows = (data ?? [])
    .map((r) => (r as unknown as { historical_events: { event_type: string; event_date: string; price_before: number | null; price_after: number | null } }).historical_events)
    .filter((e) => e.event_type === FACTOR_EVENT_TYPE && e.price_before !== null && e.price_after !== null);
  if (rows.length === 0) return null;
  return historyInPlainWords({
    name,
    assetType,
    horizonSessions: FACTOR_FORWARD_SESSIONS,
    instances: rows.map((e) => ({ date: String(e.event_date), priceBefore: Number(e.price_before), priceAfter: Number(e.price_after) })),
  });
}

function fiscalLabel(q: Quarter): string {
  return `Q${q.fiscal_quarter} FY${String(q.fiscal_year).slice(2)}`;
}

function companyRows(quarters: Quarter[]): CompanyNumbersRow[] {
  return quarters.slice(0, 8).map((q) => {
    const withProv = q as Quarter & { cik?: string; currency?: string | null; provenance?: Record<string, { accn: string; form: string; filed: string; method: string }> };
    const prov = withProv.provenance ?? {};
    const any = prov.revenue ?? prov.net_income ?? Object.values(prov)[0];
    return {
      label: fiscalLabel(q),
      periodEnd: q.period_end,
      revenue: q.revenue,
      netIncome: q.net_income,
      ebitda: ebitda(q.operating_income, q.depreciation_amortization),
      freeCashFlow: freeCashFlow(q.operating_cash_flow, q.capex),
      cash: q.cash,
      debt: totalDebt(q),
      eps: q.eps_diluted,
      derived: Object.values(prov).some((p) => p.method !== "reported"),
      filingUrl: any && withProv.cik ? `https://www.sec.gov/Archives/edgar/data/${Number(withProv.cik)}/${any.accn.replace(/-/g, "")}/` : null,
      filingLabel: any ? `${any.form} filed ${any.filed}` : null,
      // The column is NOT NULL DEFAULT 'USD' (migration 0048); the fallback only
      // covers a row read without it.
      currency: withProv.currency ?? "USD",
    };
  });
}

export async function loadAnalysisSummary(args: {
  symbol: string;
  name: string;
  latest: AnalysisWithMethodology | null;
  userId: string;
  plan: "free" | "premium";
}): Promise<AnalysisSummaryView> {
  const bundle = await loadScorecard(args.symbol);
  const stored = storedSummary(args.latest);
  const status = bundle.scorecard.dimensions.slice(0, 4).every((d) => d.level === "not_applicable")
    ? bundle.assetType === "equity"
      ? "unavailable"
      : "not_applicable"
    : "available";

  let history: HistoryPlain | null = stored?.history ?? null;
  if (!history && args.latest) history = await historyFromAnalysis(args.latest.id, args.name, bundle.assetType);

  const inputs = { name: args.name, symbol: args.symbol, assetType: bundle.assetType, scorecard: bundle.scorecard, history };
  const summary = stored
    ? { headline: stored.headline, bullets: stored.bullets, source: stored.source, writtenAt: stored.generatedAt, fromAnalysis: true }
    : { ...templateSummary(inputs), source: "template" as const, writtenAt: null, fromAnalysis: false };

  const moves = bundle.reactions.slice(0, 12).map((r) => Math.abs(r.move));
  const medianEarningsMove = moves.length >= 4 ? median(moves) : null;

  let exposure: ExposureFacts | null = null;
  if (isExposureEnabled()) {
    const supabase = await createClient();
    const { data: holdings } = await supabase.from("holdings").select("symbol, quantity, asset_type").eq("user_id", args.userId);
    if (holdings?.some((h) => h.symbol === args.symbol)) {
      const symbols = [...new Set(holdings.map((h) => h.symbol))];
      const closes = await getLatestCloses(symbols, undefined, new Map(holdings.map((h) => [h.symbol, h.asset_type])));
      exposure = exposureFacts({
        symbol: args.symbol,
        holdings: holdings.map((h) => {
          const c = closes.get(h.symbol)?.latest ?? null;
          return { symbol: h.symbol, value: c === null ? null : c * Number(h.quantity) };
        }),
        medianEarningsMove,
        // Compared with the card from about a week ago (scorecard_snapshots,
        // migration 0050); null - and the line left out - until one exists.
        weakenedThisWeek:
          scorecardChanges(bundle.scorecard, await weekAgoLevels(args.symbol, bundle.scorecard, new Date().toISOString().slice(0, 10)))?.weakened.map(
            (c) => c.label,
          ) ?? null,
      });
    }
  }

  return {
    symbol: args.symbol,
    name: args.name,
    assetType: bundle.assetType,
    scorecard: bundle.scorecard,
    summary,
    history,
    historyAsOf: args.latest?.created_at ?? null,
    companyStatus: status,
    // Premium only, and left out of the payload on Free - not hidden.
    companyNumbers: status === "available" && args.plan === "premium" ? companyRows(bundle.quarters) : [],
    plan: args.plan,
    companyLocked: status === "available" && args.plan !== "premium",
    medianEarningsMove,
    exposure,
  };
}
