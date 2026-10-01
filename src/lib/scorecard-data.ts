// Server glue for the scorecard: read everything a card needs from the
// database and hand it to the pure builder in ./scorecard.ts. No figure is
// computed here beyond joining rows; the arithmetic lives in ./fundamentals.ts
// and ./scorecard.ts where it is tested.
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { readNewestFirstPaged } from "@/lib/market-data/paged-read";
import { upcomingEventsFromCalendar } from "@/lib/calendar";
import { getCurrentPrice } from "@/lib/market-data/current-price";
import { computeFactorSet, type FactorBar } from "@/lib/ai/factors";
import {
  companyDataStatus,
  companyMetrics,
  dividendGrowthYears,
  earningsReactions,
  peHistory,
  sortQuarters,
  ttmSnapshot,
  type Quarter,
  type PricePoint,
  type ReleaseDate,
  type CompanyMetrics,
  type EarningsReaction,
} from "@/lib/fundamentals";
import {
  buildScorecard,
  capitalInputFromRows,
  marketMedianPe,
  sectorMedianPe,
  trendInputsFromFactorSet,
  type FilingRef,
  type Scorecard,
  type StoredAnnualRow,
  type StoredQuarterRow,
  type UpcomingEvent,
} from "@/lib/scorecard";

/** ~5.5 years of daily bars: 20 quarter ends of P/E history plus the 200-day average. */
const PRICE_BARS = 1500;
const QUARTERS = 28;

export interface ScorecardBundle {
  scorecard: Scorecard;
  metrics: CompanyMetrics | null;
  quarters: Quarter[];
  reactions: EarningsReaction[];
  price: { value: number | null; asOf: string | null };
  assetType: string | null;
  /** Daily closes, oldest first, as read for the card (up to ~5.5 years). */
  pricesAsc: PricePoint[];
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface LoadOptions {
  today?: string;
  /** A client to read with; scripts and background jobs have no request scope for createClient(). */
  supabase?: SupabaseClient<Database>;
}

async function currentPriceOrNull(symbol: string): Promise<{ price: number | null; asOf: string | null }> {
  // getCurrentPrice reads through the request-scoped client; outside a request
  // (a script, a background job) it throws, and the stored close is used.
  try {
    const p = await getCurrentPrice(symbol);
    return { price: p.price, asOf: p.asOf };
  } catch {
    return { price: null, asOf: null };
  }
}

/**
 * Median current P/E across every profitable company Cairn stores figures for
 * - the "tracked market" the price-vs-profit sentence compares against. Same
 * method as the sector median (latest close / EPS over the last four
 * quarters), over all of `fundamentals`. Both reads are paged: the universe
 * grows with on-demand ingestion and the API caps a response at 1000 rows.
 * Kept for five minutes, since the briefing builds a card per holding.
 */
const MARKET_TTL_MS = 5 * 60 * 1000;
let marketMemo: { at: number; value: Promise<{ median: number; companies: number } | null> } | null = null;

async function readTrackedMarketPe(supabase: SupabaseClient<Database>): Promise<{ median: number; companies: number } | null> {
  const companies = await readNewestFirstPaged(
    (from, to) => supabase.from("fundamentals").select("symbol, eps_ttm").gt("eps_ttm", 0).order("symbol").range(from, to),
    100_000,
  );
  if (companies.length === 0) return null;
  const symbols = companies.map((c) => c.symbol);
  const lastBars = await readNewestFirstPaged(
    (from, to) =>
      supabase
        .rpc("recent_prices", { symbols, per_symbol: 1 })
        .order("symbol", { ascending: true })
        .range(from, to),
    symbols.length,
  );
  const close = new Map(lastBars.map((b: { symbol: string; close: number | null }) => [b.symbol, b.close === null ? null : Number(b.close)]));
  return marketMedianPe(
    companies.map((c) => {
      const px = close.get(c.symbol);
      const eps = c.eps_ttm === null ? null : Number(c.eps_ttm);
      return px && eps && eps > 0 ? px / eps : null;
    }),
  );
}

function trackedMarketPe(supabase: SupabaseClient<Database>): Promise<{ median: number; companies: number } | null> {
  if (marketMemo && Date.now() - marketMemo.at < MARKET_TTL_MS) return marketMemo.value;
  // A failed read leaves the comparison out of the sentence; it is context, not the verdict.
  const value = readTrackedMarketPe(supabase).catch(() => null);
  marketMemo = { at: Date.now(), value };
  return value;
}

export async function loadScorecard(symbolRaw: string, opts: LoadOptions = {}): Promise<ScorecardBundle> {
  const symbol = symbolRaw.toUpperCase();
  const today = opts.today ?? todayIso();
  const supabase = opts.supabase ?? (await createClient());

  // The quarterly and annual SEC tables are service-role only since migration
  // 0053 (the quarterly company table is Premium). The scorecard is free: it
  // reads them here, on the server, and only its computed sentences leave.
  const secure = createAdminClient();
  const [dirRes, qRes, aRes, fRes, relRes, calRes, bars, current] = await Promise.all([
    supabase.from("symbol_directory").select("asset_type").eq("symbol", symbol).maybeSingle(),
    secure
      .from("company_financials_quarterly")
      .select("*")
      .eq("symbol", symbol)
      .order("period_end", { ascending: false })
      .limit(QUARTERS),
    // Every column: the use-of-cash figures (migration 0061) are read when present.
    secure.from("company_financials_annual").select("*").eq("symbol", symbol),
    supabase.from("fundamentals").select("shares_outstanding, sector").eq("symbol", symbol).maybeSingle(),
    supabase.from("earnings_releases").select("release_date, timing").eq("symbol", symbol).order("release_date", { ascending: false }).limit(16),
    supabase.from("calendar_events").select("event_type, event_date, title, metadata").eq("symbol", symbol).gte("event_date", today).order("event_date").limit(10),
    readNewestFirstPaged(
      (from, to) =>
        supabase.from("historical_prices").select("ts, close, volume").eq("symbol", symbol).not("close", "is", null).order("ts", { ascending: false }).range(from, to),
      PRICE_BARS,
    ),
    currentPriceOrNull(symbol),
  ]);

  const assetType = (dirRes.data?.asset_type as string | undefined) ?? null;
  const rows = (qRes.data ?? []) as unknown as (Quarter & { cik: string; provenance: Record<string, { accn: string; form: string; filed: string }> })[];
  const quarters = sortQuarters(rows);
  const annualEps = new Map<number, number>();
  for (const a of aRes.data ?? []) if (a.eps_diluted !== null) annualEps.set(a.fiscal_year, Number(a.eps_diluted));

  const pricesAsc: PricePoint[] = bars
    .map((b) => ({ date: String(b.ts).slice(0, 10), close: Number(b.close) }))
    .reverse();
  const factorBars: FactorBar[] = bars
    .map((b) => ({ date: String(b.ts).slice(0, 10), close: Number(b.close), volume: b.volume === null ? null : Number(b.volume) }))
    .reverse();
  const price = current.price ?? pricesAsc[pricesAsc.length - 1]?.close ?? null;
  const priceDate = current.asOf ?? pricesAsc[pricesAsc.length - 1]?.date ?? null;

  const status = companyDataStatus(assetType, quarters.length);
  const metrics = status === "available" ? companyMetrics(quarters, annualEps) : null;
  const pe = status === "available" ? peHistory(quarters, pricesAsc, price, annualEps) : null;

  const latest = rows[0];
  const prov = latest?.provenance?.revenue ?? latest?.provenance?.net_income;
  const filing: FilingRef | null = latest && prov ? { accn: prov.accn, form: prov.form, filed: prov.filed, cik: latest.cik } : null;

  // Sector median P/E: profitable tracked peers in the same SEC industry.
  let sector: { median: number; peers: number; name: string } | null = null;
  const sectorName = fRes.data?.sector ?? null;
  if (status === "available" && sectorName) {
    const { data: peers } = await supabase.from("fundamentals").select("symbol, eps_ttm").eq("sector", sectorName).neq("symbol", symbol);
    const peerSymbols = (peers ?? []).map((p) => p.symbol);
    if (peerSymbols.length > 0) {
      const { data: peerBars } = await supabase.rpc("recent_prices", { symbols: peerSymbols, per_symbol: 1 });
      const close = new Map((peerBars ?? []).map((b: { symbol: string; close: number | null }) => [b.symbol, b.close === null ? null : Number(b.close)]));
      const pes = (peers ?? []).map((p) => {
        const c = close.get(p.symbol);
        const eps = p.eps_ttm === null ? null : Number(p.eps_ttm);
        return c && eps && eps > 0 ? c / eps : null;
      });
      const med = sectorMedianPe(pes);
      if (med) sector = { ...med, name: sectorName };
    }
  }

  const market = status === "available" ? await trackedMarketPe(supabase) : null;

  const shares = fRes.data?.shares_outstanding === null || fRes.data?.shares_outstanding === undefined ? null : Number(fRes.data.shares_outstanding);
  const fcf = metrics?.ttm.free_cash_flow ?? null;
  const fcfYield = fcf !== null && shares && price ? fcf / (shares * price) : null;

  const releases: ReleaseDate[] = (relRes.data ?? []).map((r) => ({ release_date: String(r.release_date), timing: r.timing as ReleaseDate["timing"] }));
  const reactions = earningsReactions(releases, pricesAsc);

  const events: UpcomingEvent[] = upcomingEventsFromCalendar(calRes.data ?? []);

  const factorSet = factorBars.length >= 252 ? computeFactorSet({ symbol, assetType, bars: factorBars }) : null;
  const snap = status === "available" ? ttmSnapshot(quarters, 0, annualEps) : null;

  const scorecard = buildScorecard({
    symbol,
    assetType,
    today,
    companyData: status,
    metrics,
    valuation: { pe, sector, market, fcfYield: pe?.current ? null : fcfYield, priceDate, filing },
    dividend: {
      perShareTtm: snap?.dividends_per_share ?? null,
      price,
      payoutOfFcf: metrics?.payoutOfFcf ?? null,
      freeCashFlow: fcf,
      growthYears: status === "available" ? dividendGrowthYears(quarters) : null,
      filing,
    },
    capital: status === "available" ? capitalInputFromRows((aRes.data ?? []) as unknown as StoredAnnualRow[], rows as unknown as StoredQuarterRow[]) : undefined,
    trend: trendInputsFromFactorSet(factorSet),
    events,
    reactions,
    filing,
  });

  return { scorecard, metrics, quarters, reactions, price: { value: price, asOf: priceDate }, assetType, pricesAsc };
}
