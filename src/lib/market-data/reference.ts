// Reference data that is *about* an instrument rather than a price bar: the
// company profile (roadmap Phase 10 - "ESG Score Panel: On the Company Profile
// tab"), the financial statements, and the options chain.
//
// Same contract as ./ingest.ts and for the same reason: nothing here is seeded
// or estimated. A fetch either lands real provider rows in Supabase or it
// records that the provider carries nothing for this symbol, and the surfaces
// render that as an explicit absence. There is no path in this file that
// invents a number.
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { reserveProviderCall } from "@/lib/market-data/ingest";
import type { Database } from "@/lib/supabase/types";

type StatementInsert = Database["public"]["Tables"]["financial_statements"]["Insert"];
type OptionInsert = Database["public"]["Tables"]["option_contracts"]["Insert"];

const QUOTE_SUMMARY_BASE = process.env.MARKET_DATA_QUOTE_SUMMARY_BASE_URL ?? process.env.MARKET_DATA_CHART_BASE_URL ?? "https://query1.finance.yahoo.com";
const TIMEOUT_MS = Number(process.env.MARKET_DATA_TIMEOUT_MS ?? 8000);

// Reference data moves on a filing/announcement cadence, not a tick cadence.
const PROFILE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const STATEMENTS_TTL_MS = 24 * 60 * 60 * 1000;
const OPTIONS_TTL_MS = 30 * 60 * 1000;

export type ReferenceStatus = "available" | "unavailable" | "rate_limited" | "error";

interface FetchOutcome<T> {
  status: ReferenceStatus;
  detail: string | null;
  data: T | null;
}

async function getJson(url: string): Promise<FetchOutcome<unknown>> {
  if (!reserveProviderCall()) {
    return { status: "rate_limited", detail: "Cairn is throttling its own provider requests this minute", data: null };
  }
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (cairn-ingest/1.0)" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (err) {
    return { status: "error", detail: err instanceof Error ? err.message : String(err), data: null };
  }
  if (res.status === 404) return { status: "unavailable", detail: "Provider has no such record", data: null };
  if (res.status === 429) return { status: "rate_limited", detail: "Provider rate limit reached", data: null };
  if (!res.ok) return { status: "error", detail: `Provider returned HTTP ${res.status}`, data: null };
  try {
    return { status: "available", detail: null, data: await res.json() };
  } catch (err) {
    return { status: "error", detail: err instanceof Error ? err.message : "Malformed provider response", data: null };
  }
}

/**
 * Yahoo wraps most numerics as `{ raw, fmt, longFmt }` but returns some as bare
 * numbers. Reading `.raw` blindly turns the bare ones into `undefined`, which
 * then renders as a blank line item beside populated ones - an absence that
 * looks like "the company reported nothing here".
 */
function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "object" && "raw" in (value as Record<string, unknown>)) {
    const raw = (value as { raw?: unknown }).raw;
    return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * A count that cannot meaningfully be negative - volume, open interest. A
 * provider returning one means the field is wrong, not that the contract has
 * minus 1,550 open positions, and printing it verbatim beside real figures
 * presents a broken value as market data. Treated as missing instead.
 */
function count(value: unknown): number | null {
  const n = num(value);
  if (n === null || n < 0) return null;
  return n;
}

/**
 * Yahoo mixes epoch units: statement `endDate` is seconds, `firstTradeDate-
 * Milliseconds` is milliseconds. They are told apart by magnitude - but by the
 * magnitude of the ABSOLUTE value, because instruments that first traded
 * before 1970 carry a negative epoch. Comparing the signed value against a
 * positive threshold classified every one of them as seconds and multiplied
 * again by 1000: the S&P 500's -631123200000 became the year -18030, which
 * `toISOString()` renders in extended-year form ("-018030-07-30T...") and
 * Postgres rejects outright, so the whole profile row failed to store. The
 * oldest and best-known listings were exactly the ones with no profile.
 */
function isoDate(value: unknown): string | null {
  const epoch = num(value);
  if (epoch === null) return null;
  const ms = Math.abs(epoch) >= 1e11 ? epoch : epoch * 1000;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  // A four-digit year is the only thing a `date` column accepts. Anything
  // outside it means the unit guess was wrong, and a wrong date is worse than
  // no date.
  const year = d.getUTCFullYear();
  if (year < 1000 || year > 9999) return null;
  return d.toISOString().slice(0, 10);
}

function stale(asOf: string | null | undefined, ttlMs: number): boolean {
  if (!asOf) return true;
  return Date.now() - new Date(asOf).getTime() > ttlMs;
}

// ------------------------------------------------------------------ profile
export interface SymbolProfile {
  symbol: string;
  long_name: string | null;
  summary: string | null;
  sector: string | null;
  industry: string | null;
  website: string | null;
  country: string | null;
  city: string | null;
  employees: number | null;
  exchange: string | null;
  currency: string | null;
  quote_type: string | null;
  first_trade_date: string | null;
  source: string;
  as_of: string;
}

/**
 * Fetch and store the instrument's descriptive profile, at most once a week per
 * symbol. Returns the stored row, or null when the provider carries no profile
 * for it - which is the normal answer for an index or an FX pair, not a fault.
 */
export async function ensureProfile(symbol: string): Promise<SymbolProfile | null> {
  const supabase = createAdminClient();
  const { data: existing } = await supabase.from("symbol_profiles").select("*").eq("symbol", symbol).maybeSingle();
  if (existing && !stale(existing.as_of, PROFILE_TTL_MS)) return existing as SymbolProfile;

  const url = `${QUOTE_SUMMARY_BASE}/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=assetProfile,price,summaryDetail`;
  const outcome = await getJson(url);
  // A provider refusal must not clear a profile that was fetched successfully
  // last week - the page keeps showing the older record with its as-of date.
  if (outcome.status !== "available" || !outcome.data) return (existing as SymbolProfile) ?? null;

  const result = (outcome.data as { quoteSummary?: { result?: unknown[] } }).quoteSummary?.result?.[0] as
    | {
        assetProfile?: Record<string, unknown>;
        price?: Record<string, unknown>;
        summaryDetail?: Record<string, unknown>;
      }
    | undefined;
  if (!result) return (existing as SymbolProfile) ?? null;

  const p = result.assetProfile ?? {};
  const price = result.price ?? {};
  const row = {
    symbol,
    long_name: (price.longName as string) ?? (price.shortName as string) ?? null,
    summary: (p.longBusinessSummary as string) ?? null,
    sector: (p.sector as string) ?? null,
    industry: (p.industry as string) ?? null,
    website: (p.website as string) ?? null,
    country: (p.country as string) ?? null,
    city: (p.city as string) ?? null,
    employees: num(p.fullTimeEmployees),
    exchange: (price.exchangeName as string) ?? (price.exchange as string) ?? null,
    currency: (price.currency as string) ?? null,
    quote_type: (price.quoteType as string) ?? null,
    first_trade_date: isoDate(price.firstTradeDateMilliseconds ?? (result.summaryDetail ?? {}).firstTradeDateMilliseconds),
    source: "yahoo_finance_quote_summary",
    as_of: new Date().toISOString(),
  };

  // Every descriptive field empty means the provider answered but carries no
  // profile for this instrument. Storing that row would render an all-dashes
  // panel; returning null lets the tab say so in words instead.
  const hasContent = Boolean(row.long_name || row.summary || row.sector || row.industry || row.exchange);
  if (!hasContent) return (existing as SymbolProfile) ?? null;

  const { error } = await supabase.from("symbol_profiles").upsert(row, { onConflict: "symbol" });
  if (error) return (existing as SymbolProfile) ?? null;
  return row as SymbolProfile;
}

// --------------------------------------------------------------- statements
export type StatementKind = "income" | "balance" | "cash_flow";
export type PeriodType = "annual" | "quarterly";

export interface StatementPeriod {
  period_end: string;
  currency: string | null;
  line_items: Record<string, number | null>;
}

// Provider key -> the label the statement table prints, in the order accountants
// read them. A key absent from the response is skipped rather than rendered as a
// blank row, so a partial filing does not look like a set of zero balances.
export const STATEMENT_LINES: Record<StatementKind, { key: string; label: string; emphasis?: boolean }[]> = {
  income: [
    { key: "totalRevenue", label: "Total revenue", emphasis: true },
    { key: "costOfRevenue", label: "Cost of revenue" },
    { key: "grossProfit", label: "Gross profit", emphasis: true },
    { key: "researchDevelopment", label: "Research & development" },
    { key: "sellingGeneralAdministrative", label: "Selling, general & admin" },
    { key: "totalOperatingExpenses", label: "Total operating expenses" },
    { key: "operatingIncome", label: "Operating income", emphasis: true },
    { key: "interestExpense", label: "Interest expense" },
    { key: "incomeBeforeTax", label: "Income before tax" },
    { key: "incomeTaxExpense", label: "Income tax expense" },
    { key: "netIncome", label: "Net income", emphasis: true },
  ],
  balance: [
    { key: "cash", label: "Cash & equivalents" },
    { key: "shortTermInvestments", label: "Short-term investments" },
    { key: "netReceivables", label: "Net receivables" },
    { key: "inventory", label: "Inventory" },
    { key: "totalCurrentAssets", label: "Total current assets", emphasis: true },
    { key: "propertyPlantEquipment", label: "Property, plant & equipment" },
    { key: "goodWill", label: "Goodwill" },
    { key: "totalAssets", label: "Total assets", emphasis: true },
    { key: "accountsPayable", label: "Accounts payable" },
    { key: "shortLongTermDebt", label: "Short-term debt" },
    { key: "totalCurrentLiabilities", label: "Total current liabilities", emphasis: true },
    { key: "longTermDebt", label: "Long-term debt" },
    { key: "totalLiab", label: "Total liabilities", emphasis: true },
    { key: "totalStockholderEquity", label: "Total stockholder equity", emphasis: true },
  ],
  cash_flow: [
    { key: "netIncome", label: "Net income" },
    { key: "depreciation", label: "Depreciation & amortisation" },
    { key: "changeToNetincome", label: "Non-cash adjustments" },
    { key: "changeToOperatingActivities", label: "Change in operating activities" },
    { key: "totalCashFromOperatingActivities", label: "Cash from operations", emphasis: true },
    { key: "capitalExpenditures", label: "Capital expenditure" },
    { key: "investments", label: "Investments" },
    { key: "totalCashflowsFromInvestingActivities", label: "Cash from investing", emphasis: true },
    { key: "dividendsPaid", label: "Dividends paid" },
    { key: "repurchaseOfStock", label: "Share repurchases" },
    { key: "totalCashFromFinancingActivities", label: "Cash from financing", emphasis: true },
    { key: "changeInCash", label: "Net change in cash", emphasis: true },
  ],
};

const STATEMENT_MODULES: Record<StatementKind, Record<PeriodType, string>> = {
  income: { annual: "incomeStatementHistory", quarterly: "incomeStatementHistoryQuarterly" },
  balance: { annual: "balanceSheetHistory", quarterly: "balanceSheetHistoryQuarterly" },
  cash_flow: { annual: "cashflowStatementHistory", quarterly: "cashflowStatementHistoryQuarterly" },
};

// The array key Yahoo nests each module's periods under.
const STATEMENT_ARRAYS: Record<string, string> = {
  incomeStatementHistory: "incomeStatementHistory",
  incomeStatementHistoryQuarterly: "incomeStatementHistory",
  balanceSheetHistory: "balanceSheetStatements",
  balanceSheetHistoryQuarterly: "balanceSheetStatements",
  cashflowStatementHistory: "cashflowStatements",
  cashflowStatementHistoryQuarterly: "cashflowStatements",
};

/**
 * Fetch and store income / balance / cash-flow history. Returns the number of
 * periods stored; 0 means the provider filed nothing for this symbol, which is
 * the normal answer for an ETF, an index, an FX pair or a coin.
 */
export async function ensureStatements(symbol: string, currency: string | null = null): Promise<number> {
  const supabase = createAdminClient();
  const { data: existing } = await supabase
    .from("financial_statements")
    .select("updated_at")
    .eq("symbol", symbol)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing && !stale(existing.updated_at, STATEMENTS_TTL_MS)) return -1; // -1 = served from store

  const modules = Object.values(STATEMENT_MODULES).flatMap((m) => Object.values(m));
  const url = `${QUOTE_SUMMARY_BASE}/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules.join(",")}`;
  const outcome = await getJson(url);
  if (outcome.status !== "available" || !outcome.data) return -1;

  const result = (outcome.data as { quoteSummary?: { result?: unknown[] } }).quoteSummary?.result?.[0] as
    | Record<string, { [key: string]: unknown }>
    | undefined;
  if (!result) return 0;

  const rows: StatementInsert[] = [];
  for (const [statement, byPeriod] of Object.entries(STATEMENT_MODULES) as [StatementKind, Record<PeriodType, string>][]) {
    for (const [periodType, moduleName] of Object.entries(byPeriod) as [PeriodType, string][]) {
      // Not named `module`: Next forbids assigning that identifier.
      const block = result[moduleName];
      const periods = (block?.[STATEMENT_ARRAYS[moduleName]] as Record<string, unknown>[] | undefined) ?? [];
      for (const period of periods) {
        const periodEnd = isoDate(period.endDate);
        if (!periodEnd) continue;
        const lineItems: Record<string, number> = {};
        for (const { key } of STATEMENT_LINES[statement]) {
          const value = num(period[key]);
          if (value !== null) lineItems[key] = value;
        }
        // A period with no recognised lines carries nothing a reader could use.
        if (Object.keys(lineItems).length === 0) continue;
        rows.push({
          symbol,
          statement,
          period_type: periodType,
          period_end: periodEnd,
          currency,
          line_items: lineItems,
          source: "yahoo_finance_quote_summary",
          updated_at: new Date().toISOString(),
        });
      }
    }
  }

  if (rows.length === 0) return 0;
  const { error } = await supabase
    .from("financial_statements")
    .upsert(rows, { onConflict: "symbol,statement,period_type,period_end" });
  return error ? 0 : rows.length;
}

// ------------------------------------------------------------------ options
export interface OptionContract {
  expiry: string;
  option_type: "call" | "put";
  strike: number;
  last_price: number | null;
  bid: number | null;
  ask: number | null;
  change_pct: number | null;
  volume: number | null;
  open_interest: number | null;
  implied_volatility: number | null;
  in_the_money: boolean | null;
  contract_symbol: string | null;
}

/**
 * Fetch and store the front-expiry options chain plus the list of expiries the
 * provider offers. Returns the expiries; an empty list means no listed options,
 * which is the correct answer for most ETFs and every non-equity asset type.
 */
export async function ensureOptions(symbol: string, expiry?: string): Promise<{ expiries: string[]; stored: number }> {
  const supabase = createAdminClient();
  if (!expiry) {
    const { data: cached } = await supabase
      .from("option_contracts")
      .select("as_of")
      .eq("symbol", symbol)
      .order("as_of", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (cached && !stale(cached.as_of, OPTIONS_TTL_MS)) {
      const { data: rows } = await supabase.from("option_contracts").select("expiry").eq("symbol", symbol);
      const expiries = [...new Set((rows ?? []).map((r) => r.expiry as string))].sort();
      return { expiries, stored: 0 };
    }
  }

  const qs = expiry ? `?date=${Math.floor(new Date(`${expiry}T00:00:00Z`).getTime() / 1000)}` : "";
  const outcome = await getJson(`${QUOTE_SUMMARY_BASE}/v7/finance/options/${encodeURIComponent(symbol)}${qs}`);
  if (outcome.status !== "available" || !outcome.data) return { expiries: [], stored: 0 };

  const chain = (outcome.data as { optionChain?: { result?: unknown[] } }).optionChain?.result?.[0] as
    | { expirationDates?: number[]; options?: { expirationDate?: number; calls?: Record<string, unknown>[]; puts?: Record<string, unknown>[] }[] }
    | undefined;
  if (!chain) return { expiries: [], stored: 0 };

  const expiries = (chain.expirationDates ?? []).map((s) => isoDate(s)).filter((d): d is string => d !== null);
  const rows: OptionInsert[] = [];
  for (const group of chain.options ?? []) {
    const groupExpiry = isoDate(group.expirationDate) ?? expiry ?? expiries[0];
    if (!groupExpiry) continue;
    for (const [optionType, contracts] of [
      ["call", group.calls ?? []],
      ["put", group.puts ?? []],
    ] as ["call" | "put", Record<string, unknown>[]][]) {
      for (const c of contracts) {
        const strike = num(c.strike);
        if (strike === null) continue;
        rows.push({
          symbol,
          expiry: groupExpiry,
          option_type: optionType,
          strike,
          last_price: num(c.lastPrice),
          bid: num(c.bid),
          ask: num(c.ask),
          change_pct: num(c.percentChange),
          volume: count(c.volume),
          open_interest: count(c.openInterest),
          // Implied volatility is a rate, not a count, but a negative one is
          // equally impossible.
          implied_volatility: count(c.impliedVolatility),
          in_the_money: typeof c.inTheMoney === "boolean" ? c.inTheMoney : null,
          contract_symbol: (c.contractSymbol as string) ?? null,
          as_of: new Date().toISOString(),
        });
      }
    }
  }

  if (rows.length > 0) {
    await supabase.from("option_contracts").upsert(rows, { onConflict: "symbol,expiry,option_type,strike" });
  }
  return { expiries, stored: rows.length };
}
