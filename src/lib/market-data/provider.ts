// Free-tier market data provider for the ingestion layer. This is a fetch
// client only - it does not write to Supabase itself. Historical prices
// still come from `historical_prices` (see lib/actions/screener.ts,
// lib/actions/ticker.ts); this is the documented, ready-to-wire path for
// keeping that table fresh, gated behind an env var so the app runs fine
// against seeded/existing data with no key configured.
//
// Providers:
//   * Intraday (1D/1W charts) - Yahoo's chart endpoint, keyless. Default.
//   * Quotes - Tiingo, only when TIINGO_API_KEY is set and valid.
// The previous paid provider was the sole intraday provider and became a
// silent single point of failure when its key stopped being accepted; the paid
// provider is now an optional fast path that falls through to Yahoo on any
// failure.
// LEGAL: flagged for cfo-legal-advisor ToS review - Yahoo's chart endpoint is
// undocumented and its terms should be checked before launch.
// LEGAL: Tiingo's published terms license its API data for INTERNAL USE ONLY
// on every self-serve plan (Starter, Power and Commercial alike): "you may not
// display or share the data with another person or organization". Showing
// Tiingo prices to Cairn subscribers is redistribution, which Tiingo sells
// separately on request (sales@tiingo.com). Do not set TIINGO_API_KEY in
// production until that is resolved - see cfo-legal-advisor.

export interface QuoteResult {
  symbol: string;
  price: number | null;
  changePercent: number | null;
  volume: number | null;
  fetchedAt: string;
  /**
   * The provider's own date for this quote (YYYY-MM-DD). On a closed market
   * this is the last session, NOT today - so it, not `fetchedAt`, is what the
   * "as of" label must use, or a Friday close reads as live on Sunday.
   */
  quoteDate: string | null;
  /** The provider's own "is the market for this symbol trading right now" flag. */
  marketOpen: boolean;
  // Session figures from the same quote. Without these a live headline price
  // was displayed next to an "Open" and "Day range" read off the stored daily
  // bar, which is how /ticker/AAPL came to show a price outside its own day
  // range. Any surface showing both must take both from one source.
  open: number | null;
  dayHigh: number | null;
  dayLow: number | null;
}

const TIINGO_BASE = "https://api.tiingo.com";

// Yahoo's chart endpoint serves intraday bars with no API key, and is already
// the source ingest.ts and the Edge Functions use for daily bars. It is the
// default intraday provider for that reason: 1D/1W charts should not depend on
// a key at all.
//
// The paid provider stays as an optional override for anyone holding a valid
// key, but it is no longer required. Its predecessor had become a silent
// single point of failure: a rejected key returned 401, and because the only
// signal the UI had was "is a key present", the chart reported "Intraday isn't
// available on this deployment" - which read as a missing feature rather than
// a rejected credential.
const CHART_BASE = process.env.MARKET_DATA_CHART_BASE_URL ?? "https://query1.finance.yahoo.com";

/**
 * Intraday needs no configuration now that Yahoo is the default. Kept as a
 * function (rather than removed) because callers use it to decide whether to
 * explain an absence to the user, and a future provider may reintroduce a key.
 */
export function isMarketDataProviderConfigured(): boolean {
  return true;
}

/**
 * Tiingo's ticker for a symbol. Equities and ETFs use the plain ticker. Coins
 * use a lowercase concatenated `basequote` pair (`btcusd`), per Tiingo's crypto
 * docs; the bare ticker is a different, real listing - `BTC` resolves to
 * "Grayscale Bitcoin Mini Trust ETF" on NYSE at ~$34, not Bitcoin at ~$77k.
 * This is the Tiingo counterpart of `yahooSymbol`, which appends `-USD` for the
 * same reason. `BTC/EUR` keeps its own quote currency; a bare coin is USD.
 */
function tiingoSymbol(symbol: string, assetType?: "equity" | "etf" | "crypto"): string {
  if (assetType !== "crypto") return symbol;
  if (symbol.includes("/")) return symbol.replace("/", "").toLowerCase();
  return `${symbol.replace(/-USD$/i, "")}usd`.toLowerCase();
}

// Tiingo takes the token as an `Authorization: Token <key>` header or a `token`
// query param (both documented). The header keeps the key out of URLs, which
// end up in logs and in Next's fetch-cache keys.
function tiingoHeaders(apiKey: string): Record<string, string> {
  return { "Content-Type": "application/json", Authorization: `Token ${apiKey}` };
}

// Tiingo's payloads are untrusted third-party JSON, and its docs do not always
// say whether a response is an object or a one-element array, so both are
// accepted. Everything read off a record is still presence-checked.
function asRecords(value: unknown): Record<string, unknown>[] {
  const list = Array.isArray(value) ? value : value && typeof value === "object" ? [value] : [];
  return list.filter((v): v is Record<string, unknown> => !!v && typeof v === "object");
}

function toNum(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

const NEW_YORK = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** A moment's calendar date and minutes-since-midnight on the US exchange clock. */
function newYorkParts(d: Date): { date: string; minutes: number } {
  const p: Record<string, string> = {};
  for (const part of NEW_YORK.formatToParts(d)) p[part.type] = part.value;
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

/** YYYY-MM-DD (UTC) for `days` days before now; Tiingo's `startDate` is date-only. */
function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

// Rate limits (Tiingo pricing page): Starter 50 requests/hour and 1,000/day,
// Power 10,000/hour and 100,000/day; there is no per-minute limit. Every call
// below is cached for one minute (`revalidate: 60`), so one symbol costs at
// most 60 requests/hour app-wide however many users look at it - over Starter's
// hourly cap, comfortably inside Power's. The interval is left at 60 rather
// than stretched to fit Starter because Starter is not licensed for this use
// anyway (see the LEGAL note at the top of the file).
export async function fetchQuote(
  symbol: string,
  assetType?: "equity" | "etf" | "crypto",
): Promise<QuoteResult | null> {
  const apiKey = process.env.TIINGO_API_KEY;
  if (!apiKey) return null;

  try {
    if (assetType === "crypto") return await fetchCryptoQuote(symbol, apiKey);

    // A `BASE/QUOTE` pair that is not a coin is forex, as lib/market-data/fx.ts
    // asks for it (`USD/EUR`). Anything else with a slash is not something
    // Tiingo's equity endpoint can resolve, so it is "no quote", not a request.
    if (symbol.includes("/")) {
      const pair = /^([A-Za-z]{3})\/([A-Za-z]{3})$/.exec(symbol);
      return pair ? await fetchForexQuote(pair[1], pair[2], apiKey) : null;
    }
    return await fetchEquityQuote(symbol, apiKey);
  } catch {
    // Network error or a body that is not JSON: no quote, same as a non-2xx.
    return null;
  }
}

/**
 * Whether a US equity quote stamped `quoteAt` is an in-session quote as of
 * `now`. Tiingo has no market-open flag, and callers use one to pick the
 * previous-close row for the day change (current-price.ts), so guessing "closed"
 * during the session gives a change measured against the wrong day. Live only
 * when all hold: the stamp is today on the exchange clock (a weekend or holiday
 * leaves it on the last session - observed: a Sunday quote stamped Friday
 * 20:00Z), now is inside 09:30-16:00 New York, and the stamp is recent (which
 * also catches early-close days and halts). A thinly-printed ticker whose stamp
 * lags more than 30 minutes reads as closed - the safe direction for a label.
 */
export function isEquityQuoteLive(quoteAt: Date, now: Date = new Date()): boolean {
  if (newYorkParts(quoteAt).date !== newYorkParts(now).date) return false;
  const { minutes } = newYorkParts(now);
  if (minutes < 9 * 60 + 30 || minutes >= 16 * 60) return false;
  return now.getTime() - quoteAt.getTime() <= 30 * 60_000;
}

/**
 * Forex: GET /tiingo/fx/top?tickers=<base><quote>,<quote><base>. Tiingo lists
 * each pair one way round only, in market convention - `eurusd` is USD per EUR
 * (1.1486), `usdjpy` is JPY per USD (156.88) - and returns nothing for the
 * other direction (`usdeur`, `usdgbp`, `usdaud` all came back empty). So both
 * orders are requested at once: a direct hit is used as is, an inverse hit is
 * inverted, and neither is "no quote". The rate is the mid of bid and ask.
 */
async function fetchForexQuote(base: string, quote: string, apiKey: string): Promise<QuoteResult | null> {
  const direct = `${base}${quote}`.toLowerCase();
  const inverse = `${quote}${base}`.toLowerCase();
  const res = await fetch(`${TIINGO_BASE}/tiingo/fx/top?tickers=${direct},${inverse}`, {
    headers: tiingoHeaders(apiKey),
    next: { revalidate: 60 },
  });
  if (!res.ok) return null;

  // Observed, not documented: when the request names a pair Tiingo does not
  // list, the row that does exist comes back keyed `index` rather than `ticker`
  // (`[{"index":"eurusd",...}]` for `tickers=usdeur,eurusd`). Either is read.
  const rows = asRecords(await res.json());
  const tickerOf = (r: Record<string, unknown>) =>
    typeof r.ticker === "string" ? r.ticker.toLowerCase() : typeof r.index === "string" ? r.index.toLowerCase() : null;
  const directRow = rows.find((r) => tickerOf(r) === direct);
  const inverseRow = rows.find((r) => tickerOf(r) === inverse);
  const row = directRow ?? inverseRow;
  const mid = toNum(row?.midPrice);
  if (!row || mid === null || mid <= 0) return null;

  const stamp = toDate(row.quoteTimestamp);
  return {
    symbol: `${base}/${quote}`.toUpperCase(),
    price: directRow ? mid : 1 / mid,
    changePercent: null,
    volume: null,
    fetchedAt: new Date().toISOString(),
    quoteDate: stamp ? stamp.toISOString().slice(0, 10) : null,
    // Forex has no exchange session to report and Tiingo sends no flag.
    marketOpen: false,
    open: null,
    dayHigh: null,
    dayLow: null,
  };
}

/** IEX top-of-book / last price: GET /iex/<ticker>. */
async function fetchEquityQuote(symbol: string, apiKey: string): Promise<QuoteResult | null> {
  const res = await fetch(`${TIINGO_BASE}/iex/${encodeURIComponent(symbol)}`, {
    headers: tiingoHeaders(apiKey),
    next: { revalidate: 60 },
  });
  if (!res.ok) return null;

  const row = asRecords(await res.json())[0];
  if (!row) return null;

  // `tngoLast` is Tiingo's own last price. `last` is the IEX trade print, which
  // Tiingo returns as null unless the account holds a signed IEX market data
  // agreement, so it cannot be the source.
  const price = toNum(row.tngoLast);
  if (price === null) return null;

  // Tiingo returns no percent change; it does return `prevClose`.
  const prevClose = toNum(row.prevClose);
  const stamp = toDate(row.timestamp);

  return {
    symbol: symbol.toUpperCase(),
    price,
    changePercent: prevClose !== null && prevClose !== 0 ? ((price - prevClose) / prevClose) * 100 : null,
    volume: toNum(row.volume),
    fetchedAt: new Date().toISOString(),
    // `timestamp` is Tiingo's data-refresh time. Read on the exchange clock so
    // the date is the session's, whatever offset the string carries.
    quoteDate: stamp ? newYorkParts(stamp).date : null,
    // Tiingo's IEX response has no market-open flag, so it is derived from the
    // quote's own stamp; no stamp => assume closed, the safe direction.
    marketOpen: stamp ? isEquityQuoteLive(stamp) : false,
    open: toNum(row.open),
    dayHigh: toNum(row.high),
    dayLow: toNum(row.low),
  };
}

/**
 * Crypto: GET /tiingo/crypto/prices?tickers=<pair>&startDate=&resampleFreq=1hour.
 * Tiingo's crypto top-of-book endpoint is marked deprecated in its docs, and the
 * prices endpoint returns bars rather than a session quote, so the day figures
 * are folded from hourly bars: everything on the last bar's UTC calendar day is
 * "today", and the change is against the last bar before that day.
 */
async function fetchCryptoQuote(symbol: string, apiKey: string): Promise<QuoteResult | null> {
  const url =
    `${TIINGO_BASE}/tiingo/crypto/prices?tickers=${encodeURIComponent(tiingoSymbol(symbol, "crypto"))}` +
    `&startDate=${daysAgo(1)}&resampleFreq=1hour`;
  const res = await fetch(url, { headers: tiingoHeaders(apiKey), next: { revalidate: 60 } });
  if (!res.ok) return null;

  const bars = asRecords(asRecords(await res.json())[0]?.priceData)
    .map((b) => ({
      at: toDate(b.date),
      open: toNum(b.open),
      high: toNum(b.high),
      low: toNum(b.low),
      close: toNum(b.close),
      volume: toNum(b.volume),
    }))
    .filter((b): b is typeof b & { at: Date } => b.at !== null)
    .sort((a, b) => a.at.getTime() - b.at.getTime());

  const last = bars[bars.length - 1];
  if (!last || last.close === null) return null;

  const utcDay = (b: { at: Date }) => b.at.toISOString().slice(0, 10);
  const day = utcDay(last);
  const today = bars.filter((b) => utcDay(b) === day);
  const prior = bars.filter((b) => utcDay(b) < day && b.close !== null).pop();
  const highs = today.map((b) => b.high).filter((n): n is number => n !== null);
  const lows = today.map((b) => b.low).filter((n): n is number => n !== null);
  const volumes = today.map((b) => b.volume).filter((n): n is number => n !== null);

  return {
    symbol: symbol.toUpperCase(),
    price: last.close,
    changePercent: prior?.close ? ((last.close - prior.close) / prior.close) * 100 : null,
    // Base-currency volume, summed over today's bars.
    volume: volumes.length > 0 ? volumes.reduce((a, b) => a + b, 0) : null,
    fetchedAt: new Date().toISOString(),
    quoteDate: day,
    // Crypto trades 24/7, so unlike an equity there is no closed state to
    // report; current-price.ts already treats a crypto quote as live.
    marketOpen: true,
    open: today[0]?.open ?? null,
    dayHigh: highs.length > 0 ? Math.max(...highs) : null,
    dayLow: lows.length > 0 ? Math.min(...lows) : null,
  };
}

export interface IntradayBar {
  /** ISO timestamp of the bar open. */
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
  // Yahoo first, because it needs no key. Tiingo is tried only when a key is
  // present, and a failure there falls through to Yahoo rather than returning
  // null - a rejected key must not take the feature down.
  const apiKey = process.env.TIINGO_API_KEY;
  if (apiKey) {
    const viaTiingo = await fetchIntradayFromTiingo(symbol, interval, outputsize, extendedHours, apiKey, assetType);
    if (viaTiingo && viaTiingo.length > 0) return viaTiingo;
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

/**
 * Tiingo intraday bars. Equities and ETFs: GET /iex/<ticker>/prices; coins:
 * GET /tiingo/crypto/prices?tickers=<pair>. Both take `startDate` (date only)
 * and `resampleFreq`, so the window is a lookback in days, trimmed to the last
 * `outputsize` bars afterwards - 4 days for 1min covers a weekend plus a Monday
 * holiday, 9 for 15min covers the 1W chart's span with the same padding.
 *
 * Tiingo returns at most 5,001 rows per request, oldest first, so an over-long
 * window loses the NEWEST bars without any error: a 4-day crypto 1min request
 * (~5,800 bars) came back ending a day stale. Coins trade around the clock, so
 * their 1min lookback is one day; and a response at the cap is refused rather
 * than served, falling through to Yahoo instead of drawing a stale chart. The
 * cap is observed behaviour, not something Tiingo's docs state.
 */
async function fetchIntradayFromTiingo(
  symbol: string,
  interval: "1min" | "15min",
  outputsize: number,
  extendedHours: boolean,
  apiKey: string,
  assetType?: "equity" | "etf" | "crypto",
): Promise<IntradayBar[] | null> {
  const isCrypto = assetType === "crypto";
  const lookbackDays = interval === "15min" ? 9 : isCrypto ? 1 : 4;
  // IEX history is regular-session only by default. `afterHours=true` adds the
  // pre/post-market bars (checked live 2026-09-20: bars spanned 09:30-16:00 ET
  // without it, 08:00-17:30 ET with it) but is NOT on the docs pages read for
  // this integration. If Tiingo ever ignores it the setting degrades to a
  // no-op rather than an error, and the session filter below still holds when
  // extended hours are off.
  const range =
    `startDate=${daysAgo(lookbackDays)}&resampleFreq=${interval}` + (extendedHours && !isCrypto ? "&afterHours=true" : "");
  const url = isCrypto
    ? `${TIINGO_BASE}/tiingo/crypto/prices?tickers=${encodeURIComponent(tiingoSymbol(symbol, assetType))}&${range}`
    : `${TIINGO_BASE}/iex/${encodeURIComponent(symbol)}/prices?${range}`;

  try {
    // Cache for one minute: a 1min series gains at most one bar in that window.
    const res = await fetch(url, { headers: tiingoHeaders(apiKey), next: { revalidate: 60 } });
    if (!res.ok) return null;

    const payload = await res.json();
    // Crypto nests its bars under `priceData` of the per-ticker record; IEX
    // returns the bars directly.
    const rows = isCrypto ? asRecords(asRecords(payload)[0]?.priceData) : asRecords(payload);
    if (rows.length >= 5000) return null;

    const bars: IntradayBar[] = [];
    for (const row of rows) {
      const at = toDate(row.date);
      if (!at) continue;
      // Tiingo documents no extended-hours switch on its intraday endpoints, so
      // the setting is applied here: an equity bar outside 09:30-16:00 New York
      // is dropped unless extended hours were asked for. Coins have no session.
      if (!isCrypto && !extendedHours) {
        const { minutes } = newYorkParts(at);
        if (minutes < 9 * 60 + 30 || minutes >= 16 * 60) continue;
      }
      bars.push({ ts: at.toISOString(), close: toNum(row.close) });
    }

    bars.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
    return bars.slice(-Math.min(outputsize, 5000));
  } catch {
    // Any failure - network, bad JSON - falls through to Yahoo in the caller.
    return null;
  }
}
