// Scheduled Edge Function: builds the equity side of historical_events -
// the analogs computeProbabilityBand() measures against.
//
// Why this exists: historical_events held 36 rows, all crypto volatility
// regimes written by ingest-crypto, and zero equity rows. Every equity
// analysis therefore died on "No historical analogs with usable before/after
// prices" before the model was ever called. Phase 4 specifies earnings,
// splits, and dividend reactions as the equity analog set; this ingests all
// three from sources already in use elsewhere in this codebase.
//
// Sources, both keyless:
//   - Yahoo Finance chart ?events=div,split  - dividend ex-dates and split
//     execution dates with ratios (same host as market-adapters.ts).
//   - Nasdaq api/company/{symbol}/earnings-surprise - reported earnings dates
//     with EPS vs consensus (same host as ingest-calendar).
//
// price_before / price_after are NOT taken from either feed. They are read
// back out of historical_prices, which is the store the rest of the engine
// measures against, so an analog's move is computed from the same bars the
// chart draws. An event whose surrounding bars are missing is skipped rather
// than written with a null leg - a row with no usable move is invisible to
// the probability band anyway and would only inflate the analog count.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { deriveVolatilityRegimes, EQUITY_PERIODS_PER_YEAR } from "../_shared/volatility.ts";
import { requireCronSecret } from "../_shared/auth.ts";
import { earningsReactionRows, reactionWindow as sharedReactionWindow } from "../_shared/earnings-reactions.ts";
import { readNewestFirstPaged } from "../_shared/paged-read.ts";

/** Directory-only shares processed per run; the rest rotate through on later days. */
const MAX_DIRECTORY_SYMBOLS_PER_RUN = 60;

/**
 * The close on the last session strictly before the event, and on the first
 * session strictly after it - the one-session reaction window (shared with the
 * on-demand path: _shared/earnings-reactions.ts), on this function's bar shape.
 */
function reactionWindow(bars: PriceBar[], eventDate: string) {
  return sharedReactionWindow(bars.map((b) => ({ date: String(b.ts).slice(0, 10), close: b.close, volume: b.volume })), eventDate);
}


const UA_YAHOO = "Mozilla/5.0 (cairn-ingest/1.0)";
const UA_NASDAQ = "Mozilla/5.0 (compatible; cairn-ingest/1.0)";

// Matches the 2y of daily bars ingest-market-data pulls. Reaching further back
// would produce events with no bars to measure them against.
const EVENTS_RANGE = "2y";
// Upper bound on the bars read per symbol when deriving volatility regimes.
// 2y of daily bars is ~505; 1500 leaves headroom for a longer backfill without
// ever depending on an unbounded read.
const MAX_BARS = 2000;

interface PriceBar {
  ts: string;
  close: number | null;
  volume: number | null;
}

interface EventRow {
  symbol: string;
  sector: string | null;
  event_type: string;
  event_date: string;
  description: string;
  price_before: number | null;
  price_after: number | null;
  volume_at_event: number | null;
  metadata: Record<string, unknown>;
}

// Sector labels match the ones the news tagger writes to news_items.sectors,
// so a sector-scoped analysis can join news and analogs on the same string.
const SECTORS: Record<string, string> = {
  AAPL: "technology",
  MSFT: "technology",
  NVDA: "semiconductors",
  GOOGL: "technology",
  AMZN: "technology",
  TSLA: "automotive",
};

function isoFromUnix(seconds: number): string {
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

function normalizeUsDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const [, m, d, y] = slash;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

async function fetchYahooEvents(
  symbol: string,
): Promise<{ dividends: { date: string; amount: number }[]; splits: { date: string; ratio: string }[] }> {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?range=${EVENTS_RANGE}&interval=1d&events=div%2Csplit`;
  const res = await fetch(url, { headers: { "User-Agent": UA_YAHOO } });
  if (!res.ok) throw new Error(`yahoo ${symbol}: HTTP ${res.status}`);

  const json = await res.json();
  const events = json?.chart?.result?.[0]?.events ?? {};

  const dividends = Object.values((events.dividends ?? {}) as Record<string, { date: number; amount: number }>)
    .filter((d) => typeof d?.date === "number" && typeof d?.amount === "number")
    .map((d) => ({ date: isoFromUnix(d.date), amount: d.amount }));

  const splits = Object.values(
    (events.splits ?? {}) as Record<
      string,
      { date: number; numerator: number; denominator: number; splitRatio?: string }
    >,
  )
    .filter((s) => typeof s?.date === "number")
    .map((s) => ({
      date: isoFromUnix(s.date),
      ratio: s.splitRatio ?? `${s.numerator}:${s.denominator}`,
    }));

  return { dividends, splits };
}

interface EarningsRow {
  date: string;
  eps: number | null;
  consensus: string | null;
  surprisePct: string | null;
}

async function fetchNasdaqEarnings(symbol: string): Promise<EarningsRow[]> {
  const res = await fetch(`https://api.nasdaq.com/api/company/${encodeURIComponent(symbol)}/earnings-surprise`, {
    headers: { "User-Agent": UA_NASDAQ, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`nasdaq ${symbol}: HTTP ${res.status}`);

  const json = await res.json();
  const rows =
    (json?.data?.earningsSurpriseTable as { rows?: Record<string, string | number>[] } | undefined)?.rows ?? [];

  return rows
    .map((r) => ({
      date: normalizeUsDate(String(r.dateReported ?? "")),
      eps: typeof r.eps === "number" ? r.eps : null,
      consensus: r.consensusForecast != null ? String(r.consensusForecast) : null,
      surprisePct: r.percentageSurprise != null ? String(r.percentageSurprise) : null,
    }))
    .filter((r): r is EarningsRow => r.date !== null);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  // Scheduled callers must present the shared secret; see _shared/auth.ts.
  const unauthorized = requireCronSecret(req);
  if (unauthorized) return unauthorized;

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Same universe rule as ingest-calendar: only symbols the app actually
  // tracks, read off the enabled market_data providers.
  const { data: providers } = await supabase
    .from("data_providers")
    .select("config")
    .eq("provider_type", "market_data")
    .eq("enabled", true);

  const symbols = Array.from(
    new Set(
      (providers ?? [])
        .filter((p: { config: Record<string, unknown> }) => (p.config?.asset_type ?? "equity") !== "crypto")
        .flatMap((p: { config: Record<string, unknown> }) =>
          Array.isArray(p.config?.symbols) ? (p.config.symbols as unknown[]) : [],
        )
        // 0020_asset_type_per_symbol rewrote config.symbols into a mixed array:
        // plain strings for symbols taking the provider default, and
        // { symbol, asset_type } objects for the ones that override it. Reading
        // it as string[] threw on the first object entry and cost the whole run.
        .map((entry) => {
          if (typeof entry === "string") return entry.toUpperCase();
          const sym = (entry as Record<string, unknown>)?.symbol;
          return typeof sym === "string" ? sym.toUpperCase() : null;
        })
        .filter((s): s is string => s !== null),
    ),
  );

  // Every available US share in the symbol directory too (fix/analysis-
  // coverage), not only the provider list. The provider list runs every day;
  // directory-only shares rotate through in slices so a run stays bounded.
  const directory: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data: page, error } = await supabase
      .from("symbol_directory")
      .select("symbol")
      .eq("status", "available")
      .eq("asset_type", "equity")
      .order("symbol")
      .range(from, from + 999);
    if (error) return Response.json({ error: `symbol_directory read failed: ${error.message}` }, { status: 500, headers: corsHeaders });
    for (const r of (page ?? []) as { symbol: string }[]) {
      const s = r.symbol.toUpperCase();
      if (!symbols.includes(s) && !directory.includes(s)) directory.push(s);
    }
    if (!page || page.length < 1000) break;
  }
  const slices = Math.max(1, Math.ceil(directory.length / MAX_DIRECTORY_SYMBOLS_PER_RUN));
  const slice = Math.floor(Date.now() / 86_400_000) % slices;
  const todays = directory.slice(slice * MAX_DIRECTORY_SYMBOLS_PER_RUN, (slice + 1) * MAX_DIRECTORY_SYMBOLS_PER_RUN);
  const runSymbols = [...symbols, ...todays];

  const results = [];

  for (const symbol of runSymbols) {
    try {
      // Newest-first with an explicit bound, then reversed: ordered ascending
      // with no limit, what comes back is whatever PostgREST's row cap allows
      // - the OLDEST rows - so the regimes derived here would be computed from
      // the start of the history and silently stop tracking recent ones.
      // Paged: the API returns at most 1000 rows per request, so a single
      // .limit(MAX_BARS) read silently stopped at 1000 (about four years).
      const bars = await readNewestFirstPaged<PriceBar>(
        (from, to) => supabase.from("historical_prices").select("ts, close, volume").eq("symbol", symbol).order("ts", { ascending: false }).range(from, to),
        MAX_BARS,
      );

      const priceBars = bars.slice().reverse();
      if (priceBars.length === 0) {
        results.push({ symbol, error: "no price history to measure events against" });
        continue;
      }

      // One feed failing should not cost the symbol its other analog types.
      const [yahoo, earnings] = await Promise.all([
        fetchYahooEvents(symbol).catch(() => ({
          dividends: [] as { date: string; amount: number }[],
          splits: [] as { date: string; ratio: string }[],
        })),
        fetchNasdaqEarnings(symbol).catch(() => [] as EarningsRow[]),
      ]);

      const sector = SECTORS[symbol] ?? null;
      const candidates: Omit<EventRow, "price_before" | "price_after" | "volume_at_event">[] = [
        ...earnings.map((e) => ({
          symbol,
          sector,
          event_type: "earnings",
          event_date: e.date,
          description:
            `${symbol} reported quarterly earnings` +
            (e.eps !== null ? ` - EPS ${e.eps} vs consensus ${e.consensus ?? "n/a"}` : "") +
            (e.surprisePct !== null ? ` (${e.surprisePct}% surprise)` : ""),
          metadata: {
            source: "nasdaq_earnings_surprise",
            eps: e.eps,
            consensus: e.consensus,
            surprise_pct: e.surprisePct,
          },
        })),
        ...yahoo.dividends.map((d) => ({
          symbol,
          sector,
          event_type: "dividend",
          event_date: d.date,
          description: `${symbol} traded ex-dividend - $${d.amount} per share`,
          metadata: { source: "yahoo_chart_events", amount: d.amount },
        })),
        ...yahoo.splits.map((s) => ({
          symbol,
          sector,
          event_type: "split",
          event_date: s.date,
          description: `${symbol} ${s.ratio} stock split took effect`,
          metadata: { source: "yahoo_chart_events", ratio: s.ratio },
        })),
      ];

      const rows: EventRow[] = [];
      let skipped = 0;
      for (const c of candidates) {
        const window = reactionWindow(priceBars, c.event_date);
        if (!window) {
          skipped++;
          continue;
        }
        rows.push({
          ...c,
          price_before: window.before,
          price_after: window.after,
          volume_at_event: window.volume,
        });
      }

      // Earnings-day moves from the share's own SEC results releases (8-K item
      // 2.02, stored by ingest-fundamentals). They cover every share with
      // filings, not only the ones Nasdaq's endpoint answers for; a Nasdaq row
      // for the same date wins, since it carries the EPS surprise.
      const { data: releases } = await supabase.from("earnings_releases").select("release_date, accn, timing").eq("symbol", symbol);
      const nasdaqDates = new Set(earnings.map((e) => e.date));
      const secRows = earningsReactionRows(
        symbol,
        ((releases ?? []) as { release_date: string; accn: string; timing: string | null }[]).filter((r) => !nasdaqDates.has(String(r.release_date))),
        priceBars.map((b) => ({ date: String(b.ts).slice(0, 10), close: b.close, volume: b.volume })),
      );
      for (const r of secRows) rows.push({ ...r, sector });

      // Derived volatility regimes, the same analog source ingest-crypto uses.
      //
      // Without these, a symbol's only analogs are Nasdaq earnings and Yahoo
      // dividends. Both return nothing for most long-tail names - and both are
      // wrapped in a .catch above, so the failure is silent - which left every
      // symbol outside the mega-cap seed set with zero analogs and made
      // analysis generation fail outright. Regimes are computed from closes we
      // already store, so they work for any symbol with enough price history,
      // including one that was only just ingested on demand.
      const regimes = deriveVolatilityRegimes(
        priceBars.map((b) => String(b.ts).slice(0, 10)),
        priceBars.map((b) => Number(b.close)),
        EQUITY_PERIODS_PER_YEAR,
      );
      for (const r of regimes) {
        rows.push({
          symbol,
          sector,
          event_type: "volatility_regime",
          event_date: r.event_date,
          description: r.description,
          metadata: { source: "derived_realized_volatility" },
          price_before: r.price_before,
          price_after: r.price_after,
          volume_at_event: null,
        });
      }

      let upserted = 0;
      if (rows.length > 0) {
        const { error } = await supabase
          .from("historical_events")
          .upsert(rows, { onConflict: "symbol,event_type,event_date", ignoreDuplicates: false });
        if (error) {
          results.push({ symbol, error: error.message });
          continue;
        }
        upserted = rows.length;
      }

      results.push({
        symbol,
        earnings: earnings.length,
        sec_earnings: secRows.length,
        dividends: yahoo.dividends.length,
        splits: yahoo.splits.length,
        regimes: regimes.length,
        upserted,
        skipped_no_price_window: skipped,
      });
    } catch (err) {
      results.push({ symbol, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return Response.json({ provider_symbols: symbols.length, directory_symbols: directory.length, directory_slice: `${slice + 1}/${slices}`, results }, { headers: corsHeaders });
});
