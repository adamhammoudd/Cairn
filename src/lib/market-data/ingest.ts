// On-demand (lazy) symbol ingestion.
//
// The tracked universe used to be `data_providers.config.symbols` -- a list
// someone had to edit. Anything not on it did not exist as far as the app was
// concerned, however much data the provider had (the audit pulled 24 long-tail
// tickers from this same endpoint, 0 of which Cairn knew about). This module
// turns "we don't track that" into "we hadn't fetched that yet": the first
// time anyone searches for or opens a symbol, it is fetched, typed, stored,
// and from then on refreshed by the daily job like any other symbol.
//
// See docs/decisions/2026-08-20-universe-size.md (option b).
//
// Three things keep an unbounded-by-design fetch path from becoming an
// unbounded load:
//   * symbol_directory is a cache with a TTL per outcome -- a hit is not
//     re-fetched for FRESH_MS, a miss is remembered for NEGATIVE_MS, and a
//     provider refusal backs off for COOLDOWN_MS;
//   * a process-wide token bucket caps outbound provider calls, and returns
//     `rate_limited` rather than queueing, so a caller never hangs;
//   * concurrent callers for the same symbol share one in-flight promise.
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AssetType } from "@/lib/supabase/types";

// Base URLs are configurable so a test harness can point them at a local
// stand-in; unset, they are the endpoints the Edge Functions already use.
const CHART_BASE = process.env.MARKET_DATA_CHART_BASE_URL ?? "https://query1.finance.yahoo.com";
const COINGECKO_BASE = process.env.COINGECKO_BASE_URL ?? "https://api.coingecko.com/api/v3";

const FRESH_MS = 15 * 60 * 1000; // a symbol fetched this recently is reused as-is
const NEGATIVE_MS = 24 * 60 * 60 * 1000; // "no such symbol" is remembered for a day
const COOLDOWN_MS = 5 * 60 * 1000; // provider said no (429/5xx); back off

export type IngestStatus = "available" | "unavailable" | "rate_limited" | "error";

export interface IngestResult {
  symbol: string;
  status: IngestStatus;
  assetType: AssetType | null;
  name: string | null;
  bars: number;
  /** Human-readable reason, shown in the UI for non-available outcomes. */
  detail: string | null;
  /** True when this result came from symbol_directory rather than the provider. */
  cached: boolean;
  /**
   * On a rate_limited result: whether it was Cairn's own budget (refills in
   * under a minute) or the provider refusing (needs a longer wait). The two
   * call for different words to the reader.
   */
  selfThrottled?: boolean;
}

// Yahoo's instrumentType, which is per symbol and is the whole point: reading
// asset_type once per provider row is what left every ETF filed as an equity
// and the Markets ETF/Forex/Indices tabs permanently empty.
const INSTRUMENT_TYPE_TO_ASSET_TYPE: Record<string, AssetType> = {
  EQUITY: "equity",
  ETF: "etf",
  MUTUALFUND: "etf",
  CRYPTOCURRENCY: "crypto",
  CURRENCY: "forex",
  INDEX: "index",
  FUTURE: "future",
};

export interface ProviderBar {
  ts: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}

interface ProviderResponse {
  ok: true;
  providerSymbol: string;
  assetType: AssetType;
  name: string | null;
  bars: ProviderBar[];
}
type ProviderFailure = {
  ok: false;
  status: Exclude<IngestStatus, "available">;
  detail: string;
  /**
   * True when Cairn's own per-minute budget refused the call rather than the
   * provider. That budget refills within a minute, so it must NOT be written
   * to symbol_directory as a five-minute cooldown - doing so would lock a
   * symbol out for far longer than the thing that blocked it.
   */
  selfThrottled?: boolean;
};

// ------------------------------------------------------------- rate limiting
// Outbound calls per rolling minute across the whole process. Yahoo's public
// chart endpoint publishes no quota, so this is a self-imposed ceiling chosen
// to stay well under what a browser tab would generate, not a documented one.
const MAX_CALLS_PER_MINUTE = Number(process.env.MARKET_DATA_MAX_CALLS_PER_MINUTE ?? 60);
const callTimestamps: number[] = [];

function takeToken(): boolean {
  const now = Date.now();
  while (callTimestamps.length > 0 && now - callTimestamps[0] > 60_000) callTimestamps.shift();
  if (callTimestamps.length >= MAX_CALLS_PER_MINUTE) return false;
  callTimestamps.push(now);
  return true;
}

/**
 * The same budget, for the reference-data fetchers in ./reference.ts. Profile,
 * statement and options calls go to the same provider as the price bars, so
 * they have to draw on one bucket - two independent ceilings would add up to
 * double the rate we told ourselves we would use.
 */
export function reserveProviderCall(): boolean {
  return takeToken();
}

// ------------------------------------------------------------ symbol shaping
// Index tickers lead with a caret (^GSPC), so the first character cannot be
// restricted to alphanumerics or the Indices asset class is unreachable.
const SYMBOL_RE = /^[A-Z0-9^][A-Z0-9.\-^=]{0,14}$/;

export function normalizeSymbol(raw: string): string | null {
  const symbol = raw.trim().toUpperCase();
  if (!symbol || !SYMBOL_RE.test(symbol)) return null;
  return symbol;
}

// A coin is stored under its bare ticker (BTC), but the chart endpoint wants
// Yahoo's pair form (BTC-USD); forex likewise (EURUSD=X). Candidates are tried
// in order, so a real equity ticker still resolves as an equity first.
function providerCandidates(symbol: string): string[] {
  if (symbol.includes("-") || symbol.includes("=") || symbol.startsWith("^")) return [symbol];
  const candidates = [symbol];
  if (/^[A-Z]{2,6}$/.test(symbol)) candidates.push(`${symbol}-USD`);
  if (/^[A-Z]{6}$/.test(symbol)) candidates.push(`${symbol}=X`);
  return candidates;
}

/** Bare storage symbol for a provider symbol: BTC-USD -> BTC, EURUSD=X -> EURUSD. */
export function storageSymbol(providerSymbol: string): string {
  return providerSymbol.replace(/-USD$/, "").replace(/=X$/, "");
}

// --------------------------------------------------------------- the provider
async function fetchChart(providerSymbol: string, range: string): Promise<ProviderResponse | ProviderFailure> {
  if (!takeToken()) {
    return {
      ok: false,
      status: "rate_limited",
      detail: "Cairn is throttling its own provider requests this minute",
      selfThrottled: true,
    };
  }

  const url = `${CHART_BASE}/v8/finance/chart/${encodeURIComponent(providerSymbol)}?range=${range}&interval=1d`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (cairn-ingest/1.0)" },
      // A user is waiting on this; fail fast rather than holding the request.
      signal: AbortSignal.timeout(Number(process.env.MARKET_DATA_TIMEOUT_MS ?? 8000)),
      cache: "no-store",
    });
  } catch (err) {
    return { ok: false, status: "error", detail: err instanceof Error ? err.message : String(err) };
  }

  if (res.status === 404) return { ok: false, status: "unavailable", detail: "Provider has no data for this symbol" };
  if (res.status === 429) return { ok: false, status: "rate_limited", detail: "Provider rate limit reached" };
  if (!res.ok) return { ok: false, status: "error", detail: `Provider returned HTTP ${res.status}` };

  let json: unknown;
  try {
    json = await res.json();
  } catch (err) {
    return { ok: false, status: "error", detail: err instanceof Error ? err.message : "Malformed provider response" };
  }

  const chart = (json as { chart?: { result?: unknown[]; error?: { description?: string } } }).chart;
  const result = chart?.result?.[0] as
    | {
        meta?: { instrumentType?: string; longName?: string; shortName?: string; symbol?: string };
        timestamp?: number[];
        indicators?: { quote?: { open?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[]; close?: (number | null)[]; volume?: (number | null)[] }[] };
      }
    | undefined;

  if (!result) {
    return { ok: false, status: "unavailable", detail: chart?.error?.description ?? "Provider returned no series" };
  }

  const timestamps = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0] ?? {};
  const bars: ProviderBar[] = timestamps.map((ts, i) => ({
    ts: new Date(ts * 1000).toISOString().slice(0, 10),
    open: quote.open?.[i] ?? null,
    high: quote.high?.[i] ?? null,
    low: quote.low?.[i] ?? null,
    close: quote.close?.[i] ?? null,
    volume: quote.volume?.[i] ?? null,
  })).filter((b) => b.close !== null);

  if (bars.length === 0) {
    return { ok: false, status: "unavailable", detail: "Provider returned an empty series" };
  }

  const declared = result.meta?.instrumentType ?? "";
  const assetType = INSTRUMENT_TYPE_TO_ASSET_TYPE[declared.toUpperCase()];
  if (!assetType) {
    // Better to refuse than to file an unknown instrument under a guessed type
    // -- a mislabelled row is what emptied the ETF tab in the first place.
    return { ok: false, status: "unavailable", detail: `Unsupported instrument type "${declared || "unknown"}"` };
  }

  return {
    ok: true,
    providerSymbol,
    assetType,
    name: result.meta?.longName ?? result.meta?.shortName ?? null,
    bars,
  };
}

// CoinGecko carries what a chart endpoint cannot: coin name, rank, market cap,
// supply, and the rolling 24h change the crypto surfaces read.
async function fetchCoinMetrics(symbol: string): Promise<Record<string, unknown> | null> {
  if (!takeToken()) return null;
  try {
    const search = await fetch(`${COINGECKO_BASE}/search?query=${encodeURIComponent(symbol)}`, {
      signal: AbortSignal.timeout(Number(process.env.MARKET_DATA_TIMEOUT_MS ?? 8000)),
      cache: "no-store",
    });
    if (!search.ok) return null;
    const found = (await search.json()) as { coins?: { id: string; symbol: string }[] };
    const match = (found.coins ?? []).find((c) => c.symbol.toUpperCase() === symbol.toUpperCase());
    if (!match) return null;

    if (!takeToken()) return null;
    const markets = await fetch(
      `${COINGECKO_BASE}/coins/markets?vs_currency=usd&ids=${encodeURIComponent(match.id)}&per_page=1&page=1`,
      { signal: AbortSignal.timeout(Number(process.env.MARKET_DATA_TIMEOUT_MS ?? 8000)), cache: "no-store" },
    );
    if (!markets.ok) return null;
    const rows = (await markets.json()) as Record<string, unknown>[];
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------- storage
async function readDirectory(symbol: string) {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("symbol_directory")
    .select("symbol, asset_type, name, status, bars, detail, last_checked_at, last_success_at")
    .eq("symbol", symbol)
    .maybeSingle();
  return data ?? null;
}

async function writeDirectory(
  symbol: string,
  patch: { asset_type?: string; name?: string | null; status: IngestStatus; bars?: number; detail?: string | null },
) {
  const supabase = createAdminClient();
  const now = new Date().toISOString();
  const { data: existing } = await supabase.from("symbol_directory").select("symbol, request_count").eq("symbol", symbol).maybeSingle();

  const row = {
    symbol,
    // asset_type is NOT NULL; a failed lookup keeps whatever was known before,
    // falling back to equity only for a symbol that never resolved.
    asset_type: patch.asset_type ?? "equity",
    name: patch.name ?? null,
    status: patch.status,
    bars: patch.bars ?? 0,
    detail: patch.detail ?? null,
    last_checked_at: now,
    last_success_at: patch.status === "available" ? now : undefined,
    last_requested_at: now,
    request_count: (existing?.request_count ?? 0) + 1,
  };

  if (existing) {
    // A failed lookup must not overwrite what a previous success established
    // (type, name, bar count) - only the status and the timestamps.
    await supabase
      .from("symbol_directory")
      .update({
        ...(patch.asset_type === undefined ? {} : { asset_type: patch.asset_type }),
        ...(patch.name ? { name: patch.name } : {}),
        ...(patch.bars === undefined ? {} : { bars: patch.bars }),
        ...(row.last_success_at === undefined ? {} : { last_success_at: row.last_success_at }),
        status: row.status,
        detail: row.detail,
        last_checked_at: row.last_checked_at,
        last_requested_at: row.last_requested_at,
        request_count: row.request_count,
      })
      .eq("symbol", symbol);
    return;
  }

  await supabase.from("symbol_directory").insert({
    symbol: row.symbol,
    asset_type: row.asset_type,
    name: row.name,
    status: row.status,
    bars: row.bars,
    detail: row.detail,
    last_checked_at: row.last_checked_at,
    ...(row.last_success_at === undefined ? {} : { last_success_at: row.last_success_at }),
    last_requested_at: row.last_requested_at,
    request_count: row.request_count,
  });
}

async function storeBars(symbol: string, assetType: AssetType, bars: ProviderBar[]) {
  const supabase = createAdminClient();
  const rows = bars.map((b) => ({ symbol, asset_type: assetType, ts: b.ts, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume }));
  // Chunked: a 2y series is ~505 rows and a single upsert of the whole thing is
  // fine, but a 5y/max range is not, and the failure mode would be a silent
  // partial write.
  for (let i = 0; i < rows.length; i += 400) {
    const { error } = await supabase
      .from("historical_prices")
      .upsert(rows.slice(i, i + 400), { onConflict: "symbol,ts", ignoreDuplicates: false });
    if (error) throw new Error(error.message);
  }
}

async function storeCoinMetrics(symbol: string, coin: Record<string, unknown>) {
  const supabase = createAdminClient();
  await supabase.from("crypto_metrics").upsert(
    {
      symbol,
      coingecko_id: String(coin.id ?? symbol.toLowerCase()),
      name: String(coin.name ?? symbol),
      market_cap: (coin.market_cap as number) ?? null,
      total_volume_24h: (coin.total_volume as number) ?? null,
      circulating_supply: (coin.circulating_supply as number) ?? null,
      max_supply: (coin.max_supply as number) ?? null,
      price_change_24h_pct: (coin.price_change_percentage_24h as number) ?? null,
      market_cap_rank: (coin.market_cap_rank as number) ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "symbol" },
  );
}

// --------------------------------------------------------------- the entry point
const inFlight = new Map<string, Promise<IngestResult>>();

function fromDirectory(row: NonNullable<Awaited<ReturnType<typeof readDirectory>>>, cached: boolean): IngestResult {
  return {
    symbol: row.symbol,
    status: row.status as IngestStatus,
    assetType: row.asset_type as AssetType,
    name: row.name,
    bars: row.bars,
    detail: row.detail,
    cached,
  };
}

/**
 * Whether a directory entry we already hold has LESS history than this caller
 * needs, and so must be re-fetched even though it is otherwise fresh.
 *
 * Pure and exported so the two rules that depend on it are testable without a
 * database: it both bypasses the freshness window on the way in, and (on the
 * way out) stops a failed depth top-up from downgrading a symbol that is
 * perfectly serviceable at the history already stored.
 *
 * Only ever true for a symbol already known good. A miss or a provider refusal
 * keeps its own cooldown - asking for more history must not reopen those.
 */
export function needsDeeperHistory(
  known: { status: string; bars: number | null } | null,
  minBars: number | undefined,
): boolean {
  if (minBars === undefined || known === null) return false;
  return known.status === "available" && (known.bars ?? 0) < minBars;
}

function isFresh(row: { status: string; last_checked_at: string }): boolean {
  const age = Date.now() - new Date(row.last_checked_at).getTime();
  if (row.status === "available") return age < FRESH_MS;
  if (row.status === "unavailable") return age < NEGATIVE_MS;
  return age < COOLDOWN_MS; // rate_limited / error
}

export interface EnsureOptions {
  /** How much history to pull on a first fetch. */
  range?: string;
  /** Ignore the freshness window (the daily refresh job). */
  force?: boolean;
  /**
   * Re-fetch (at `range`) when the stored history is SHORTER than this, even
   * though the directory entry is otherwise fresh.
   *
   * The analysis engine needs far more history than a price chart does: its
   * factor states are percentiles of a symbol's own past, and over ~2 years
   * those cluster into one or two episodes, which the non-overlap rule then
   * collapses into too few analogs to measure (RKLB: n=4 against a floor of
   * 5). Callers that need depth ask for it here instead of every caller
   * paying for it - a chart, a typeahead hit and a watchlist add still pull
   * the default range.
   *
   * Self-limiting without any extra bookkeeping: FRESH_MS is 15 minutes, so a
   * symbol whose provider genuinely has less history than this re-fetches at
   * most once per freshness window, and only from a caller that asked.
   */
  minBars?: number;
}

/**
 * Make sure `symbol` is present in historical_prices, fetching it from the
 * provider if this is the first time it has been asked for. Safe to call on
 * every request: repeat calls inside the cache window cost one indexed read.
 */
export async function ensureSymbolIngested(symbolRaw: string, options: EnsureOptions = {}): Promise<IngestResult> {
  const symbol = normalizeSymbol(symbolRaw);
  if (!symbol) {
    return { symbol: symbolRaw.trim().toUpperCase(), status: "unavailable", assetType: null, name: null, bars: 0, detail: "Not a valid symbol", cached: true };
  }

  const existing = inFlight.get(symbol);
  if (existing) return existing;

  const run = (async (): Promise<IngestResult> => {
    const known = await readDirectory(symbol);
    // A fresh entry whose stored history is shorter than the caller needs is
    // still a miss for that caller: reuse it and the deeper range would never
    // be fetched. Only applies to symbols we already hold - a miss or a
    // provider refusal keeps its existing cooldown.
    const tooShallow = needsDeeperHistory(known, options.minBars);
    if (known && !options.force && !tooShallow && isFresh(known)) {
      // Still record the demand, so the refresh job knows this symbol is live.
      void createAdminClient()
        .from("symbol_directory")
        .update({ last_requested_at: new Date().toISOString(), request_count: (known as { request_count?: number }).request_count })
        .eq("symbol", symbol);
      return fromDirectory(known, true);
    }

    let failure: ProviderFailure | null = null;
    for (const candidate of providerCandidates(symbol)) {
      const res = await fetchChart(candidate, options.range ?? "2y");
      if (!res.ok) {
        failure = res;
        // A rate limit or transport error is about the provider, not the
        // symbol: stop trying variants and report it as such.
        if (res.status !== "unavailable") break;
        continue;
      }

      const stored = storageSymbol(res.providerSymbol);
      await storeBars(stored, res.assetType, res.bars);

      let name = res.name;
      if (res.assetType === "crypto") {
        const coin = await fetchCoinMetrics(stored);
        if (coin) {
          await storeCoinMetrics(stored, coin);
          name = String(coin.name ?? name ?? stored);
        }
      }

      await writeDirectory(stored, { asset_type: res.assetType, name, status: "available", bars: res.bars.length, detail: null });
      return { symbol: stored, status: "available", assetType: res.assetType, name, bars: res.bars.length, detail: null, cached: false };
    }

    // A failed DEPTH top-up is not a fact about the symbol either. The caller
    // asked for a longer range than the provider carries for this ticker (HYPE
    // has ~400 bars and no 5y series); the symbol itself is still perfectly
    // serviceable at the history we already hold. Recording "unavailable" here
    // would take a working ticker out of service - off charts, watchlists and
    // typeahead - because an analysis wanted more history than exists. Keep
    // what we have and let the caller decide whether it is enough.
    if (tooShallow && known) {
      return fromDirectory(known, true);
    }

    const status = failure?.status ?? "unavailable";
    // A refusal by our own token bucket is not a fact about the symbol, so it
    // is not recorded: the next request a few seconds later should try again
    // rather than read back a cooldown we invented.
    if (!failure?.selfThrottled) {
      await writeDirectory(symbol, {
        status,
        detail: failure?.detail ?? "Provider has no data for this symbol",
        asset_type: known?.asset_type,
        bars: known?.bars,
      });
    }
    return {
      symbol,
      status,
      assetType: (known?.asset_type as AssetType) ?? null,
      name: known?.name ?? null,
      bars: known?.bars ?? 0,
      detail: failure?.detail ?? "Provider has no data for this symbol",
      cached: false,
      selfThrottled: failure?.selfThrottled ?? false,
    };
  })();

  inFlight.set(symbol, run);
  try {
    return await run;
  } finally {
    inFlight.delete(symbol);
  }
}
