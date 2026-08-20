// Free-tier market data provider for the ingestion layer. This is a fetch
// client only - it does not write to Supabase itself. Historical prices
// still come from `historical_prices` (see lib/actions/screener.ts,
// lib/actions/ticker.ts); this is the documented, ready-to-wire path for
// keeping that table fresh, gated behind an env var so the app runs fine
// against seeded/existing data with no key configured.
//
// Provider: Twelve Data free tier (twelvedata.com) - 800 requests/day,
// 8 requests/minute, covers equities/ETFs/forex/crypto on one API, which is
// why it's picked over stitching together multiple single-asset-class free
// APIs. LEGAL: flagged for cfo-legal-advisor ToS review before any
// production ingestion job is scheduled against it - this module is not
// wired into a cron/edge function yet.

export interface QuoteResult {
  symbol: string;
  price: number | null;
  changePercent: number | null;
  volume: number | null;
  fetchedAt: string;
}

const TWELVE_DATA_BASE = "https://api.twelvedata.com";

export function isMarketDataProviderConfigured(): boolean {
  return Boolean(process.env.TWELVE_DATA_API_KEY);
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

  return {
    symbol: symbol.toUpperCase(),
    price: data.close !== undefined ? Number(data.close) : null,
    changePercent: data.percent_change !== undefined ? Number(data.percent_change) : null,
    volume: data.volume !== undefined ? Number(data.volume) : null,
    fetchedAt: new Date().toISOString(),
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
export async function fetchIntradaySeries(symbol: string, interval: "1min" | "15min", outputsize: number): Promise<IntradayBar[] | null> {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) return null;

  const url =
    `${TWELVE_DATA_BASE}/time_series?symbol=${encodeURIComponent(symbol)}` +
    `&interval=${interval}&outputsize=${Math.min(outputsize, 5000)}&order=ASC&apikey=${apiKey}`;
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
