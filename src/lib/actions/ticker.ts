"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/supabase/auth";
import { MIGRATIONS, unwrap } from "@/lib/supabase/read";
import { getCurrentPrice } from "@/lib/market-data/current-price";
import { ensureSymbolIngested } from "@/lib/market-data/ingest";
import { readNewestFirstPaged } from "@/lib/market-data/paged-read";
import { getAssetCurrency } from "@/lib/market-data/asset-currency";
import type { AssetType } from "@/lib/supabase/types";

export interface TickerData {
  symbol: string;
  assetType: AssetType;
  name: string | null;
  bars: { ts: string; close: number | null }[];
  price: number | null;
  changePct: number | null;
  volume: number | null;
  priceSource: "live" | "last_close";
  /** Date the displayed price is as of, YYYY-MM-DD - drives the freshness label. */
  priceAsOf: string | null;
  fundamentals: { shares_outstanding: number | null; eps_ttm: number | null; dividends_ttm: number | null } | null;
  cryptoMetrics: {
    name: string;
    market_cap: number | null;
    total_volume_24h: number | null;
    circulating_supply: number | null;
    max_supply: number | null;
    market_cap_rank: number | null;
  } | null;
  news: { id: string; title: string; source_name: string; url: string | null; published_at: string }[];
  /** Session and range figures the mock header cards show. */
  open: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  week52High: number | null;
  week52Low: number | null;
  /** Annualised stdev of the last 30 daily returns, in percent. */
  volatility30d: number | null;
  nextEvent: { event_type: string; event_date: string; metadata?: unknown } | null;
  /**
   * The quote currency of every price on the page (headline, chart, ranges,
   * market cap) - the asset's own, never converted. Null = currency unknown.
   */
  currency: string | null;
  esg: { environmental: number | null; social: number | null; governance: number | null; total: number | null; source: string } | null;
}

/** Why a symbol has no page, when it has no page. */
export interface TickerUnavailable {
  symbol: string;
  reason: "unavailable" | "rate_limited" | "error";
  detail: string;
}

/**
 * Distinguishes "we have never heard of this symbol" from "the provider is
 * rate-limiting us right now" so the page can say which.
 *
 * A symbol with no stored history is fetched from the provider on the spot
 * (see lib/market-data/ingest.ts) - that is what makes the universe on-demand
 * rather than a config list. Asset type is read off the ingested price
 * history rather than a hardcoded list, same as the AI engine's crypto
 * detection in lib/ai/generate.ts - a newly-ingested symbol of any type
 * routes correctly the moment its price history lands, with no second place
 * to update.
 */
export async function loadTicker(symbolRaw: string): Promise<TickerData | TickerUnavailable> {
  const symbol = symbolRaw.trim().toUpperCase();
  // Session required: a cold symbol is fetched from the provider (audit 2.3).
  if (!(await getAuthUser())) return { symbol, reason: "unavailable", detail: "Sign in to view this symbol." };
  const supabase = await createClient();

  // How many daily bars this page ships to the client. Must stay above the
  // longest range the chart and the Technicals tab offer (ALL over a 2y
  // ingest, ~505 bars) so a range button never silently shows less than it
  // says. Not exported - "use server" modules may only export async functions.
  const CHART_BAR_LIMIT = 2000;

  // Newest-first at the DB so the LIMIT keeps the most RECENT bars, then
  // reversed to ascending for the chart series and the `bars[last]` reads
  // below. Ordering ascending here silently returned the *oldest* rows.
  //
  // The cap has to exceed the longest window any chart on this page offers, or
  // the cap becomes the window: at 400 bars the chart's ALL and 2Y buttons
  // both drew the same ~19 months on a symbol with 505 stored, and the
  // Technicals tab's 200-day average could not start until a third of the way
  // into a 1-year view. CHART_BAR_LIMIT is deliberately well clear of the 2y
  // range the ingest pulls, so ALL means all of what is stored.
  //
  // Paged: the API returns at most 1000 rows per request, so one
  // `.limit(2000)` read came back with 1000 and "ALL" showed about 4 of the 5
  // stored years for the 17 symbols past that (NVDA, MSFT, AMZN, ...).
  const readChartBars = (sym: string) =>
    readNewestFirstPaged(
      (from, to) =>
        supabase
          .from("historical_prices")
          .select("ts, open, high, low, close, volume, asset_type")
          .eq("symbol", sym)
          .order("ts", { ascending: false })
          .range(from, to),
      CHART_BAR_LIMIT,
    );
  let recentBarsDesc = await readChartBars(symbol);

  if (recentBarsDesc.length === 0) {
    // First time anyone has asked for this symbol: fetch it now.
    const ingested = await ensureSymbolIngested(symbol);
    if (ingested.status !== "available") {
      return {
        symbol,
        reason: ingested.status === "rate_limited" ? "rate_limited" : ingested.status === "error" ? "error" : "unavailable",
        detail: ingested.detail ?? `No market data available for ${symbol}.`,
      };
    }
    recentBarsDesc = await readChartBars(ingested.symbol);
    if (recentBarsDesc.length === 0) {
      return { symbol, reason: "unavailable", detail: `No market data available for ${symbol}.` };
    }
  }

  const bars = recentBarsDesc.slice().reverse();
  const latest = bars[bars.length - 1];

  // 52-week high/low come from their own date-windowed query rather than being
  // filtered out of the 400-bar chart slice. 400 trading days is more than a
  // year *today*, but that is a coincidence of the current bar count, not a
  // guarantee - and it is exactly the kind of coincidence that turns into a
  // wrong number later without anything failing.
  const yearAgo = new Date();
  yearAgo.setDate(yearAgo.getDate() - 365);
  const yearIso = yearAgo.toISOString().slice(0, 10);

  const [currentPrice, { data: yearRange }, directoryRes, { data: fundamentals }, { data: cryptoMetrics }, { data: news }, { data: nextEvent }, { data: esg }] =
    await Promise.all([
      getCurrentPrice(symbol),
      // Range over intraday high/low, the convention every quote page uses --
      // deriving it from closes understates the band (it reported a 340.08 high
      // on a symbol that traded to 344.57).
      supabase.from("historical_prices").select("high, low").eq("symbol", symbol).gte("ts", yearIso),
      supabase.from("symbol_directory").select("name, asset_type").eq("symbol", symbol).maybeSingle(),
      supabase
        .from("fundamentals")
        .select("shares_outstanding, eps_ttm, dividends_ttm")
        .eq("symbol", symbol)
        .order("as_of_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("crypto_metrics")
        .select("name, market_cap, total_volume_24h, circulating_supply, max_supply, market_cap_rank")
        .eq("symbol", symbol)
        .maybeSingle(),
      supabase
        .from("news_items")
        .select("id, title, source_name, url, published_at")
        .contains("tickers", [symbol])
        .order("published_at", { ascending: false })
        // Tie-break so the ticker news list's "Load more" cursor is exact.
        .order("id", { ascending: false })
        .limit(15),
      supabase
        .from("calendar_events")
        .select("event_type, event_date, metadata")
        .eq("symbol", symbol)
        .gte("event_date", new Date().toISOString().slice(0, 10))
        .order("event_date", { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("esg_scores")
        .select("environmental, social, governance, total, source")
        .eq("symbol", symbol)
        .order("as_of_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  // The provider name and asset type for the stat block. A missing
  // symbol_directory (0027 not applied) is a broken deployment, not a symbol
  // Cairn happens to know nothing about, and must not read as the latter.
  const directory = unwrap("Ticker profile (symbol_directory)", directoryRes, MIGRATIONS.onDemandIngestion);
  const assetType = (directory?.asset_type ?? latest.asset_type) as AssetType;
  const currency = await getAssetCurrency(symbol, { client: supabase, assetType });

  const yearHighs = (yearRange ?? []).filter((b) => b.high !== null).map((b) => Number(b.high));
  const yearLows = (yearRange ?? []).filter((b) => b.low !== null).map((b) => Number(b.low));

  const recent = bars.slice(-31).filter((b) => b.close !== null).map((b) => Number(b.close));
  let volatility30d: number | null = null;
  if (recent.length >= 10) {
    const returns = recent.slice(1).map((c, i) => Math.log(c / recent[i])).filter((r) => Number.isFinite(r));
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, r) => a + (r - mean) ** 2, 0) / returns.length;
    volatility30d = Math.sqrt(variance) * Math.sqrt(252) * 100;
  }

  // Open / day range come from whichever source the headline price came from.
  // Taking the price live and the range from the stored daily bar is what
  // rendered a $315.73 price beside a "$249.52 - $256.33" day range.
  const sessionFromQuote = currentPrice.source === "live" && currentPrice.dayHigh !== null && currentPrice.dayLow !== null;
  const open = sessionFromQuote ? currentPrice.open : latest.open === null ? null : Number(latest.open);
  const dayHigh = sessionFromQuote ? currentPrice.dayHigh : latest.high === null ? null : Number(latest.high);
  const dayLow = sessionFromQuote ? currentPrice.dayLow : latest.low === null ? null : Number(latest.low);

  return {
    symbol,
    assetType,
    name: directory?.name ?? cryptoMetrics?.name ?? null,
    bars: bars.map((b) => ({ ts: b.ts, close: b.close })),
    price: currentPrice.price ?? (latest.close === null ? null : Number(latest.close)),
    changePct: currentPrice.changePct,
    volume: currentPrice.volume ?? latest.volume,
    priceSource: currentPrice.source,
    priceAsOf: currentPrice.asOf ?? latest.ts,
    fundamentals: fundamentals ?? null,
    cryptoMetrics: cryptoMetrics ?? null,
    news: news ?? [],
    esg: esg ?? null,
    open,
    dayHigh,
    dayLow,
    week52High: yearHighs.length > 0 ? Math.max(...yearHighs) : null,
    week52Low: yearLows.length > 0 ? Math.min(...yearLows) : null,
    volatility30d,
    nextEvent: nextEvent ?? null,
    currency,
  };
}
