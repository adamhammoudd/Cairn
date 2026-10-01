// The assistant's data layer: every read its tools make, in one interface.
//
// Tools (./tools.ts) format; this module fetches. The split is what lets the
// transcript suite run the real tool formatting against mocked data, and it
// keeps every read here server-side and read-only: nothing below writes to
// the database. (The one exception is find_symbol's on-demand ingestion of a
// symbol Cairn has never stored - the same ensureSymbolIngested the Research
// page and the ticker page call, which stores public price bars.)

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureSymbolIngested, normalizeSymbol } from "@/lib/market-data/ingest";
import { getCurrentPrice } from "@/lib/market-data/current-price";
import { getAssetCurrency } from "@/lib/market-data/asset-currency";
import { loadScorecard } from "@/lib/scorecard-data";
import { loadBars } from "@/lib/ai/factor-analysis";
import { benchmarkSymbolFor, computeFactorSet, deriveFactorAnalogs, MIN_FACTOR_HISTORY_BARS } from "@/lib/ai/factors";
import { tickerTextInputs } from "@/lib/ai/generate-ticker";
import { computeProbabilityBand } from "@/lib/ai/analytics";
import { historyWords } from "@/lib/ai/analysis-text";
import { isTooYoung, youngHistoryMessage } from "@/lib/ai/history-depth";
import { summaryLine, type AnalysisRowLike } from "@/lib/analysis-display";
import { isEstimatedEvent } from "@/lib/calendar";
import { plainName } from "@/lib/ai/ticker-analysis";
import { loadDailyBriefing } from "@/lib/daily-briefing-data";
import { computeHoldingMetrics, computeTotals } from "@/lib/portfolio";
import { loadCostFx } from "@/lib/market-data/fx-history";
import type { DisplayPrefs } from "@/lib/display-prefs";
import { getLatestCloses } from "@/lib/market-data/current-price";
import { webSearch, type WebSearchResult } from "@/lib/ai/assistant/web-search";

export interface SymbolHit {
  symbol: string;
  name: string;
  assetType: string | null;
  /** "stored": already in Cairn; "ingested": fetched just now; "not_found": the provider has nothing. */
  status: "stored" | "ingested" | "not_found";
  bars: number | null;
}

export interface PriceSummaryData {
  symbol: string;
  name: string;
  assetType: string | null;
  last: { price: number; date: string; source: "live" | "last_close" };
  dayChangePct: number | null;
  /** Percent change over each window, from stored daily closes. Null when the series is too short. */
  changes: { window: "week" | "month" | "6 months" | "1 year"; pct: number | null }[];
  high52: number | null;
  low52: number | null;
  bars: number;
  /** The asset's quote currency (lib/asset-currency.ts): every price above is in it, unconverted. Null = unknown. */
  currency: string | null;
}

export interface ScorecardData {
  symbol: string;
  name: string;
  assetType: string | null;
  dimensions: { key: string; label: string; level: string; verdict: string; sentence: string }[];
  sources: { label: string; url: string | null }[];
}

export interface CompanyNumbersData {
  symbol: string;
  name: string;
  /** "ttm": the last four quarters summed (Premium); "annual": the latest fiscal year. */
  basis: "ttm" | "annual" | "latest_quarter";
  periodLabel: string;
  periodEnd: string;
  revenue: number | null;
  netIncome: number | null;
  operatingIncome: number | null;
  ebitda: number | null;
  operatingCashFlow: number | null;
  freeCashFlow: number | null;
  capex: number | null;
  dividendsPerShare: number | null;
  dividendsPaid: number | null;
  cash: number | null;
  debt: number | null;
  source: { label: string; url: string | null };
  /** The currency the figures were FILED in - never converted at today's rate. */
  currency: string;
}

export interface HistoryData {
  symbol: string;
  name: string;
  kind: "similar" | "baseline" | "too_few" | "too_young" | "none";
  line: string;
  range: string | null;
  confidence: string;
  caveat: string;
  n: number;
  higher: number;
  matchedOn: string[];
  bars: number;
  /** A fresh stored analysis that was reused instead of recomputing. */
  analysisId?: string;
}

export interface NewsItemData {
  id: string;
  title: string;
  publisher: string;
  url: string | null;
  date: string;
  tickers: string[];
}

export interface CalendarItemData {
  symbol: string;
  kind: "earnings" | "ex_dividend" | "dividend_payment";
  date: string;
  estimated: boolean;
  perShareUsd: number | null;
}

export interface PortfolioHoldingData {
  symbol: string;
  name: string;
  assetType: string | null;
  quantity: number;
  valueUsd: number | null;
  weekChangePct: number | null;
  dayChangePct: number | null;
  costBasisUsd: number | null;
  gainUsd: number | null;
  gainPct: number | null;
  scores: { label: string; verdict: string; level: string }[];
}

export interface PortfolioData {
  totalValueUsd: number;
  dayChangeUsd: number;
  dayChangePct: number;
  weekChangePct: number | null;
  costBasisUsd: number | null;
  gainUsd: number | null;
  gainPct: number | null;
  holdings: PortfolioHoldingData[];
  upcoming: CalendarItemData[];
}

export interface AssistantData {
  findSymbol(query: string): Promise<SymbolHit[]>;
  priceSummary(symbol: string): Promise<PriceSummaryData | null>;
  scorecard(symbol: string): Promise<ScorecardData | null>;
  companyNumbers(symbol: string, plan: "free" | "premium"): Promise<CompanyNumbersData | null>;
  history(symbol: string): Promise<HistoryData | null>;
  news(args: { symbol?: string; query?: string; days: number }): Promise<NewsItemData[]>;
  calendar(symbols: string[], days: number): Promise<CalendarItemData[]>;
  /** Null when the reader holds nothing. */
  portfolio(): Promise<PortfolioData | null>;
  web(query: string): Promise<WebSearchResult>;
}

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (iso: string, d: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);

/** A fresh stored analysis is reused for "what history says" instead of recomputed. */
const FRESH_ANALYSIS_MS = 24 * 60 * 60 * 1000;

async function directoryRow(db: SupabaseClient<Database>, symbol: string) {
  const { data } = await db.from("symbol_directory").select("symbol, name, asset_type, status, bars").eq("symbol", symbol).maybeSingle();
  return data;
}

function pctChange(from: number | undefined, to: number): number | null {
  return from && from > 0 ? (to / from - 1) * 100 : null;
}

/**
 * The live data layer. `supabase` is the request-scoped client (RLS applies:
 * holdings are the signed-in user's own); public market tables are read with
 * the service role where migration 0053 closed them to signed-in reads.
 */
export function liveAssistantData(opts: {
  supabase: SupabaseClient<Database>;
  userId: string;
  /** The reader's display settings: with them, cost is converted at the purchase-date rate, as on the Portfolio page. */
  prefs?: DisplayPrefs;
}): AssistantData {
  const { supabase, userId, prefs } = opts;
  const admin = createAdminClient();

  return {
    async findSymbol(query) {
      const q = query.trim().slice(0, 60);
      if (!q) return [];
      const safe = q.replace(/[%_,()"\\]/g, " ").trim();
      const asSymbol = normalizeSymbol(q.replace(/^\$/, ""));
      const { data } = await admin
        .from("symbol_directory")
        .select("symbol, name, asset_type, status, bars")
        .eq("status", "available")
        .or(`symbol.eq.${asSymbol ?? "__none__"},name.ilike.%${safe}%`)
        .limit(6);
      const hits: SymbolHit[] = (data ?? []).map((r) => ({
        symbol: r.symbol,
        name: plainName(r.name ?? r.symbol, r.symbol, r.asset_type),
        assetType: r.asset_type,
        status: "stored",
        bars: r.bars,
      }));
      // An exact symbol match first, so "AMD" never loses to a name containing "amd".
      hits.sort((a, b) => Number(b.symbol === asSymbol) - Number(a.symbol === asSymbol));
      if (hits.some((h) => h.symbol === asSymbol) || !asSymbol || /\s/.test(q)) return hits;
      // Never stored: one on-demand ingestion attempt, as the ticker page does.
      const ingested = await ensureSymbolIngested(asSymbol);
      if (ingested.status === "available") {
        return [{ symbol: ingested.symbol, name: plainName(ingested.name ?? ingested.symbol, ingested.symbol, ingested.assetType), assetType: ingested.assetType, status: ingested.cached ? "stored" : "ingested", bars: ingested.bars }, ...hits];
      }
      return hits.length > 0 ? hits : [{ symbol: asSymbol, name: asSymbol, assetType: null, status: "not_found", bars: null }];
    },

    async priceSummary(symbol) {
      const dir = await directoryRow(admin, symbol);
      const bars = await loadBars(admin, symbol);
      if (bars.length === 0) return null;
      const current = await getCurrentPrice(symbol).catch(() => null);
      const lastBar = bars[bars.length - 1];
      const price = current?.price ?? lastBar.close;
      const isCrypto = dir?.asset_type === "crypto";
      // Sessions per window: a coin trades every day, a share on weekdays.
      const back = (days: number, sessions: number) => bars[bars.length - 1 - (isCrypto ? days : sessions)]?.close;
      const year = bars.slice(-(isCrypto ? 365 : 252)).map((b) => b.close);
      return {
        symbol,
        name: plainName(dir?.name ?? symbol, symbol, dir?.asset_type ?? null),
        assetType: dir?.asset_type ?? null,
        last: { price, date: current?.asOf ?? lastBar.date, source: current?.source ?? "last_close" },
        dayChangePct: current?.changePct ?? null,
        changes: [
          { window: "week", pct: pctChange(back(7, 5), price) },
          { window: "month", pct: pctChange(back(30, 21), price) },
          { window: "6 months", pct: pctChange(back(183, 126), price) },
          { window: "1 year", pct: pctChange(back(365, 252), price) },
        ],
        high52: year.length >= (isCrypto ? 300 : 200) ? Math.max(...year) : null,
        low52: year.length >= (isCrypto ? 300 : 200) ? Math.min(...year) : null,
        bars: bars.length,
        currency: await getAssetCurrency(symbol, { client: admin, assetType: dir?.asset_type ?? null }),
      };
    },

    async scorecard(symbol) {
      const dir = await directoryRow(admin, symbol);
      const bundle = await loadScorecard(symbol, { today: today(), supabase: admin });
      const sources = new Map<string, { label: string; url: string | null }>();
      for (const d of bundle.scorecard.dimensions) for (const s of d.sources) sources.set(s.label, { label: s.label, url: s.url ?? null });
      return {
        symbol,
        name: plainName(dir?.name ?? symbol, symbol, bundle.assetType),
        assetType: bundle.assetType,
        dimensions: bundle.scorecard.dimensions.map((d) => ({ key: d.key, label: d.label, level: d.level, verdict: d.verdict, sentence: d.sentence })),
        sources: [...sources.values()].slice(0, 4),
      };
    },

    async companyNumbers(symbol, plan) {
      const dir = await directoryRow(admin, symbol);
      const name = plainName(dir?.name ?? symbol, symbol, dir?.asset_type ?? null);
      const sec = { label: "SEC filings (10-Q / 10-K)", url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${encodeURIComponent(symbol)}&type=10-&dateb=&owner=include&count=40` };
      if (plan === "premium") {
        // Quarterly detail is a Premium figure (migration 0053), read here only after the plan is known.
        const { data: q } = await admin
          .from("company_financials_quarterly")
          .select("currency, period_end, fiscal_year, fiscal_quarter, revenue, net_income, operating_income, depreciation_amortization, operating_cash_flow, capex, dividends_paid, dividends_per_share, cash, long_term_debt, long_term_debt_noncurrent, long_term_debt_current, debt_current, short_term_borrowings")
          .eq("symbol", symbol)
          .order("period_end", { ascending: false })
          .limit(4);
        const rows = q ?? [];
        if (rows.length > 0) {
          const full = rows.length === 4;
          const sum = (k: keyof (typeof rows)[number]) => {
            const vals = rows.map((r) => r[k] as number | null);
            return vals.every((v) => v !== null) ? vals.reduce((a, b) => a + Number(b), 0) : null;
          };
          const pick = full ? sum : (k: keyof (typeof rows)[number]) => (rows[0][k] === null ? null : Number(rows[0][k]));
          const latest = rows[0];
          const revenue = pick("revenue");
          const op = pick("operating_income");
          const da = pick("depreciation_amortization");
          const ocf = pick("operating_cash_flow");
          const capex = pick("capex");
          const debtParts = [latest.long_term_debt ?? (Number(latest.long_term_debt_noncurrent ?? 0) + Number(latest.long_term_debt_current ?? 0) || null), latest.debt_current, latest.short_term_borrowings];
          const debt = debtParts.some((v) => v !== null) ? debtParts.reduce<number>((a, v) => a + Number(v ?? 0), 0) : null;
          return {
            symbol,
            name,
            basis: full ? "ttm" : "latest_quarter",
            periodLabel: full ? `the four quarters to ${latest.period_end}` : `the quarter to ${latest.period_end}`,
            periodEnd: String(latest.period_end),
            revenue,
            netIncome: pick("net_income"),
            operatingIncome: op,
            ebitda: op !== null && da !== null ? op + da : null,
            operatingCashFlow: ocf,
            freeCashFlow: ocf !== null && capex !== null ? ocf - Math.abs(capex) : null,
            capex,
            dividendsPerShare: pick("dividends_per_share"),
            dividendsPaid: pick("dividends_paid"),
            cash: latest.cash === null ? null : Number(latest.cash),
            debt,
            source: sec,
            currency: latest.currency ?? "USD",
          };
        }
      }
      const { data: a } = await admin
        .from("company_financials_annual")
        .select("period_end, fiscal_year, revenue, net_income, operating_income, depreciation_amortization, operating_cash_flow, capex, dividends_paid, dividends_per_share")
        .eq("symbol", symbol)
        .order("period_end", { ascending: false })
        .limit(1);
      const y = a?.[0];
      if (!y) return null;
      const n = (v: number | null) => (v === null ? null : Number(v));
      return {
        symbol,
        name,
        basis: "annual",
        periodLabel: `fiscal year ${y.fiscal_year} (to ${y.period_end})`,
        periodEnd: String(y.period_end),
        revenue: n(y.revenue),
        netIncome: n(y.net_income),
        operatingIncome: n(y.operating_income),
        ebitda: y.operating_income !== null && y.depreciation_amortization !== null ? Number(y.operating_income) + Number(y.depreciation_amortization) : null,
        operatingCashFlow: n(y.operating_cash_flow),
        freeCashFlow: y.operating_cash_flow !== null && y.capex !== null ? Number(y.operating_cash_flow) - Math.abs(Number(y.capex)) : null,
        capex: n(y.capex),
        dividendsPerShare: n(y.dividends_per_share),
        dividendsPaid: n(y.dividends_paid),
        cash: null,
        debt: null,
        source: sec,
        // The annual table has no currency column: its figures come only from
        // SEC companyfacts' `units.USD` (supabase/functions/_shared/sec-companyfacts.ts).
        currency: "USD",
      };
    },

    async history(symbol) {
      const dir = await directoryRow(admin, symbol);
      const assetType = dir?.asset_type ?? null;
      const name = plainName(dir?.name ?? symbol, symbol, assetType);

      // A fresh stored analysis answers this already - reuse it, don't recompute.
      const { data: stored } = await admin
        .from("ai_analyses")
        .select("id, created_at, scope_value, probability_low, probability_high, confidence_level, reasoning_text, sample_size, plain_summary, headline, text_source, direction_n, direction_higher, direction_horizon_sessions, direction_confidence, direction_p25, direction_median, direction_p75, direction_worst, direction_best")
        .eq("scope_type", "ticker")
        .eq("scope_value", symbol)
        .eq("status", "validated")
        .is("superseded_by", null)
        .order("created_at", { ascending: false })
        .limit(1);
      const row = stored?.[0];
      if (row && Date.now() - Date.parse(row.created_at) < FRESH_ANALYSIS_MS && row.direction_n) {
        const line = summaryLine(row as unknown as AnalysisRowLike, symbol, null);
        return { symbol, name, kind: "similar", line: line.historyLine, range: null, confidence: `Confidence: ${row.direction_confidence ?? row.confidence_level}.`, caveat: "This is what happened before, not a forecast.", n: row.direction_n, higher: row.direction_higher ?? 0, matchedOn: [], bars: 0, analysisId: row.id };
      }

      // Computed live, in memory - the same engine and words as a stored
      // analysis (tickerTextInputs + historyWords), with nothing written.
      const bars = await loadBars(admin, symbol);
      if (isTooYoung(bars.length)) {
        return { symbol, name, kind: "too_young", line: youngHistoryMessage(symbol, bars.length, assetType), range: null, confidence: "Confidence: low.", caveat: `The engine needs at least ${MIN_FACTOR_HISTORY_BARS} days of prices to compare a moment with its own past.`, n: 0, higher: 0, matchedOn: [], bars: bars.length };
      }
      const bench = benchmarkSymbolFor(symbol, assetType);
      const benchBars = bench ? await loadBars(admin, bench) : [];
      const set = computeFactorSet({ symbol, assetType, bars, benchmark: bench && benchBars.length ? { symbol: bench, bars: benchBars } : null });
      const factorAnalysis = set ? { set, benchmark: bench, result: deriveFactorAnalogs(set), events: [] } : null;
      const { inputs } = await tickerTextInputs({ supabase: admin, symbol, name, assetType, factorAnalysis, band: computeProbabilityBand([]), news: [] });
      const hw = historyWords(inputs.history, name, assetType, inputs.noHistoryReason, inputs.historyBasis)!;
      const h = inputs.history;
      return {
        symbol,
        name,
        kind: !h ? "none" : h.status === "too_few" ? "too_few" : inputs.historyBasis === "baseline" ? "baseline" : "similar",
        line: hw.line,
        range: hw.range,
        confidence: hw.confidence,
        caveat: hw.caveat,
        n: h?.n ?? 0,
        higher: h?.higher ?? 0,
        matchedOn: inputs.matchedOn ?? [],
        bars: bars.length,
      };
    },

    async news({ symbol, query, days }) {
      const since = new Date(Date.now() - days * 86_400_000).toISOString();
      let q = supabase.from("news_items").select("id, title, url, source_name, published_at, tickers").gte("published_at", since);
      if (symbol) q = q.contains("tickers", [symbol]);
      if (query) q = q.ilike("title", `%${query.replace(/[%_,()"\\]/g, " ").trim().slice(0, 60)}%`);
      const { data } = await q.order("published_at", { ascending: false }).order("id", { ascending: false }).limit(8);
      return (data ?? []).map((n) => ({
        id: n.id,
        title: n.title,
        publisher: n.source_name.replace(/\s*\(RSS\)\s*$/i, "").replace(/\s+(?:Top\s+Stories|News|Press\s+Releases)$/i, ""),
        url: n.url,
        date: String(n.published_at).slice(0, 10),
        tickers: n.tickers ?? [],
      }));
    },

    async calendar(symbols, days) {
      if (symbols.length === 0) return [];
      const from = today();
      const { data } = await supabase
        .from("calendar_events")
        .select("symbol, event_type, event_date, metadata")
        .in("symbol", symbols)
        .gte("event_date", from)
        .lte("event_date", addDays(from, days))
        .order("event_date")
        .limit(20);
      const out: CalendarItemData[] = [];
      for (const e of data ?? []) {
        const meta = (e.metadata ?? {}) as Record<string, unknown>;
        if (e.event_type === "earnings") out.push({ symbol: e.symbol ?? "", kind: "earnings", date: String(e.event_date), estimated: isEstimatedEvent(meta), perShareUsd: null });
        if (e.event_type === "dividend" || e.event_type === "ex_dividend") {
          const rate = Number(meta.rate);
          out.push({ symbol: e.symbol ?? "", kind: "ex_dividend", date: String(e.event_date), estimated: isEstimatedEvent(meta), perShareUsd: Number.isFinite(rate) && rate > 0 ? rate : null });
        }
      }
      return out;
    },

    async portfolio() {
      const { data: holdings } = await supabase.from("holdings").select("*").eq("user_id", userId);
      if (!holdings || holdings.length === 0) return null;
      const symbols = Array.from(new Set(holdings.map((h) => h.symbol)));
      const closes = await getLatestCloses(symbols, undefined, new Map(holdings.map((h) => [h.symbol, h.asset_type])));
      // The same cost conversion as the Portfolio page (lib/fx-history.ts), so the
      // gain the assistant states is the gain on screen. Cost and gain are "USD
      // at today's rate" like value: the tool multiplies them by the display rate.
      const costFx = prefs ? await loadCostFx(supabase, prefs, holdings.map((h) => h.purchase_date)) : null;
      const metrics = computeHoldingMetrics(holdings, closes, costFx);
      const totals = computeTotals(metrics, closes);
      // The dashboard's own briefing: week change, scorecard levels and dates,
      // computed exactly as the reader sees them on Base Camp.
      const briefing = await loadDailyBriefing(userId, today());
      const glance = new Map(briefing.holdings.map((g) => [g.symbol, g]));
      const bySymbol = new Map<string, PortfolioHoldingData>();
      for (const m of metrics) {
        const cur = bySymbol.get(m.symbol);
        const g = glance.get(m.symbol);
        const cost = m.costBasis;
        const next: PortfolioHoldingData = cur
          ? { ...cur, quantity: cur.quantity + m.quantity, valueUsd: cur.valueUsd === null || m.value === null ? null : cur.valueUsd + m.value, costBasisUsd: (cur.costBasisUsd ?? 0) + cost }
          : {
              symbol: m.symbol,
              name: g?.name ?? m.symbol,
              assetType: m.asset_type,
              quantity: m.quantity,
              valueUsd: m.value,
              weekChangePct: g?.weekChangePct ?? null,
              dayChangePct: (() => {
                const c = closes.get(m.symbol);
                return c?.latest && c.prev ? (c.latest / c.prev - 1) * 100 : null;
              })(),
              costBasisUsd: cost,
              gainUsd: null,
              gainPct: null,
              scores: (g?.bars ?? []).map((b) => ({ label: b.label, verdict: (b as { verdict?: string }).verdict ?? b.level, level: b.level })),
            };
        bySymbol.set(m.symbol, next);
      }
      const rows = [...bySymbol.values()].map((h) => ({
        ...h,
        gainUsd: h.valueUsd !== null && h.costBasisUsd ? h.valueUsd - h.costBasisUsd : null,
        gainPct: h.valueUsd !== null && h.costBasisUsd ? (h.valueUsd / h.costBasisUsd - 1) * 100 : null,
      }));
      rows.sort((a, b) => (b.valueUsd ?? -1) - (a.valueUsd ?? -1));
      // The Portfolio page's own totals (computeTotals), so the assistant can
      // never disagree with that page.
      return {
        totalValueUsd: totals.totalValue,
        dayChangeUsd: totals.todayChangeValue,
        dayChangePct: totals.todayChangePct,
        weekChangePct: briefing.weekChangePct,
        costBasisUsd: totals.totalCostBasis,
        gainUsd: totals.totalGain,
        gainPct: totals.totalGainPct,
        holdings: rows,
        upcoming: briefing.comingUp.slice(0, 6).map((c) => ({
          symbol: c.symbol,
          kind: /dividend/i.test(c.title) ? (/paid|payment/i.test(c.title) ? "dividend_payment" : "ex_dividend") : "earnings",
          date: c.date,
          estimated: /estimated/i.test(`${c.title} ${c.detail ?? ""}`),
          perShareUsd: null,
        })),
      };
    },

    async web(query) {
      return webSearch(query);
    },
  };
}
