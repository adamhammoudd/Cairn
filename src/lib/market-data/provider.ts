// Free-tier market data provider for the ingestion layer. This is a fetch
// client only - it does not write to Supabase itself. Historical prices
// still come from `historical_prices` (see lib/actions/screener.ts,
// lib/actions/ticker.ts); this is the documented, ready-to-wire path for
// keeping that table fresh, gated behind an env var so the app runs fine
// against seeded/existing data with no key configured.
//
// Providers:
//   * Intraday (1D/1W charts) - Yahoo's chart endpoint, keyless. Default.
//   * Quotes - Twelve Data, only when TWELVE_DATA_API_KEY is set and valid.
// Twelve Data was the sole intraday provider and became a silent single point
// of failure when its key stopped being accepted; it is now an optional
// fast path that falls through to Yahoo on any failure.
// LEGAL: flagged for cfo-legal-advisor ToS review - Yahoo's chart endpoint is
// undocumented and its terms should be checked before launch.

export interface QuoteResult {
  symbol: string;
  price: number | null;
  changePercent: number | null;
  volume: number | null;
  fetchedAt: string;
  // Session figures from the same quote. Without these a live headline price
  // was displayed next to an "Open" and "Day range" read off the stored daily
  // bar, which is how /ticker/AAPL came to show a price outside its own day
  // range. Any surface showing both must take both from one source.
  open: number | null;
  dayHigh: number | null;
  dayLow: number | null;
}

const TWELVE_DATA_BASE = "https://api.twelvedata.com";

// Yahoo's chart endpoint serves intraday bars with no API key, and is already
// the source ingest.ts and the Edge Functions use for daily bars. It is the
// default intraday provider for that reason: 1D/1W charts should not depend on
// a key at all.
//
// Twelve Data stays as an optional override for anyone holding a valid key,
// but it is no longer required. It had become a silent single point of
// failure: the configured key returns
//   401 "**apikey** parameter is incorrect or not specified"
// and because the only signal the UI had was "is a key present", the chart
// reported "Intraday isn't available on this deployment" - which read as a
// missing feature rather than a rejected credential.
const CHART_BASE = process.env.MARKET_DATA_CHART_BASE_URL ?? "https://query1.finance.yahoo.com";

/**
 * Intraday needs no configuration now that Yahoo is the default. Kept as a
 * function (rather than removed) because callers use it to decide whether to
 * explain an absence to the user, and a future provider may reintroduce a key.
 */
export function isMarketDataProviderConfigured(): boolean {
  return true;
}

export async function fetchQuote(symbol: string): Promise<QuoteResult | null> {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) return null;

  const url = `${TWELVE_DATA_BASE}/quote?symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`;
  const res = await fetch(url, { next: { revalidate: 60 } });
  if (!res.ok) return null;

  // res.json() is typed `unknown` by the current fetch typings; this is an
  // untrusted third-party payload either way, so every field below is still
  // presence-checked before use.
  const data = (await res.json()) as Record<string, unknown>;
  if (data.status === "error" || data.code) return null;

  const numeric = (key: string) => (data[key] === undefined || data[key] === null ? null : Number(data[key]));

  return {
    symbol: symbol.toUpperCase(),
    price: numeric("close"),
    changePercent: numeric("percent_change"),
    volume: numeric("volume"),
    fetchedAt: new Date().toISOString(),
    open: numeric("open"),
    dayHigh: numeric("high"),
    dayLow: numeric("low"),
  };
}

export interface IntradayBar {
  /** ISO timestamp of the bar open, in the exchange timezone the provider returns. */
  ts: string;
  close: number | null;
}

// Minute-resolution history for the 1D/1W chart ranges. `historical_prices`
// stores one row per day, so intraday can only come from the provider - with
// no key configured this returns null and callers fall back to daily closes.
export async function fetchIntradaySeries(
  symbol: string,
  interval: "1min" | "15min",
  outputsize: number,
  /**
   * Include pre-market and after-hours bars (Settings > Display > Extended
   * hours). The provider returns regular-session bars only unless prepost is
   * asked for, which is why the setting had no effect before: it was persisted
   * and never reached a request.
   */
  extendedHours = false,
  /**
   * Required for crypto. Yahoo quotes coins under a `-USD` pair, and the bare
   * ticker is very often a real, unrelated listing: `BTC` is Grayscale Bitcoin
   * Mini Trust at ~$34, not Bitcoin at ~$78,000. Getting this wrong does not
   * fail loudly - it draws a plausible chart of the wrong asset.
   */
  assetType?: "equity" | "etf" | "crypto",
): Promise<IntradayBar[] | null> {
  // Yahoo first, because it needs no key. Twelve Data is tried only when a key
  // is present, and a failure there falls through to Yahoo rather than
  // returning null - a rejected key must not take the feature down.
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (apiKey) {
    const viaTwelveData = await fetchIntradayFromTwelveData(symbol, interval, outputsize, extendedHours, apiKey);
    if (viaTwelveData && viaTwelveData.length > 0) return viaTwelveData;
  }
  return fetchIntradayFromYahoo(symbol, interval, extendedHours, assetType);
}

/** Yahoo's ticker for a symbol: coins trade as a `-USD` pair, everything else is itself. */
function yahooSymbol(symbol: string, assetType?: "equity" | "etf" | "crypto"): string {
  if (assetType !== "crypto") return symbol;
  return /-USD$/i.test(symbol) ? symbol : `${symbol}-USD`;
}

/**
 * Yahoo's chart endpoint, keyless. `interval` maps to Yahoo's own vocabulary
 * and each one carries the shortest range that covers the chart's span -
 * Yahoo rejects a 1m request for more than 7 days.
 */
async function fetchIntradayFromYahoo(
  symbol: string,
  interval: "1min" | "15min",
  extendedHours: boolean,
  assetType?: "equity" | "etf" | "crypto",
): Promise<IntradayBar[] | null> {
  const { yInterval, range } = interval === "1min" ? { yInterval: "1m", range: "1d" } : { yInterval: "15m", range: "5d" };

  const url =
    `${CHART_BASE}/v8/finance/chart/${encodeURIComponent(yahooSymbol(symbol, assetType))}` +
    `?interval=${yInterval}&range=${range}` +
    (extendedHours ? "&includePrePost=true" : "");

  // One minute, matching the shortest bar this can return.
  const res = await fetch(url, {
    next: { revalidate: 60 },
    // Yahoo returns 429 to an unidentified client.
    headers: { "User-Agent": "Mozilla/5.0 (compatible; Cairn/1.0)" },
  });
  if (!res.ok) return null;

  const payload = (await res.json()) as Record<string, unknown>;
  const chart = payload.chart as Record<string, unknown> | undefined;
  const result = Array.isArray(chart?.result) ? (chart.result[0] as Record<string, unknown> | undefined) : undefined;
  if (!result) return null;

  const stamps = result.timestamp;
  const indicators = result.indicators as Record<string, unknown> | undefined;
  const quote = Array.isArray(indicators?.quote) ? (indicators.quote[0] as Record<string, unknown> | undefined) : undefined;
  const closes = quote?.close;
  if (!Array.isArray(stamps) || !Array.isArray(closes)) return null;

  const bars: IntradayBar[] = [];
  for (let i = 0; i < stamps.length; i++) {
    const epoch = Number(stamps[i]);
    if (!Number.isFinite(epoch)) continue;
    // Yahoo pads the series with nulls where a bar did not print; those are
    // dropped rather than carried as zero, which would draw a cliff.
    const close = closes[i] === null || closes[i] === undefined ? null : Number(closes[i]);
    if (close === null || !Number.isFinite(close)) continue;
    bars.push({ ts: new Date(epoch * 1000).toISOString(), close });
  }

  return bars.length > 0 ? bars : null;
}

async function fetchIntradayFromTwelveData(
  symbol: string,
  interval: "1min" | "15min",
  outputsize: number,
  extendedHours: boolean,
  apiKey: string,
): Promise<IntradayBar[] | null> {
  const url =
    `${TWELVE_DATA_BASE}/time_series?symbol=${encodeURIComponent(symbol)}` +
    `&interval=${interval}&outputsize=${Math.min(outputsize, 5000)}&order=ASC` +
    (extendedHours ? "&prepost=true" : "") +
    `&apikey=${apiKey}`;
  // Cache for one minute: a 1min series gains at most one bar in that window,
  // and the free tier allows only 8 calls a minute across the whole app.
  const res = await fetch(url, { next: { revalidate: 60 } });
  if (!res.ok) return null;

  const data = (await res.json()) as Record<string, unknown>;
  if (data.status === "error" || data.code) return null;

  const values = data.values;
  if (!Array.isArray(values)) return null;

  return values
    .map((v) => {
      const row = v as Record<string, unknown>;
      const ts = typeof row.datetime === "string" ? row.datetime : null;
      if (!ts) return null;
      const close = row.close === undefined ? null : Number(row.close);
      return { ts, close: Number.isFinite(close) ? close : null };
    })
    .filter((b): b is IntradayBar => b !== null);
}
