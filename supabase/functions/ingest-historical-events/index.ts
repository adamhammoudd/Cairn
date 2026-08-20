// Scheduled Edge Function: builds the equity side of historical_events —
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
//   - Yahoo Finance chart ?events=div,split  — dividend ex-dates and split
//     execution dates with ratios (same host as market-adapters.ts).
//   - Nasdaq api/company/{symbol}/earnings-surprise — reported earnings dates
//     with EPS vs consensus (same host as ingest-calendar).
//
// price_before / price_after are NOT taken from either feed. They are read
// back out of historical_prices, which is the store the rest of the engine
// measures against, so an analog's move is computed from the same bars the
// chart draws. An event whose surrounding bars are missing is skipped rather
// than written with a null leg — a row with no usable move is invisible to
// the probability band anyway and would only inflate the analog count.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const UA_YAHOO = "Mozilla/5.0 (cairn-ingest/1.0)";
const UA_NASDAQ = "Mozilla/5.0 (compatible; cairn-ingest/1.0)";

// Matches the 2y of daily bars ingest-market-data pulls. Reaching further back
// would produce events with no bars to measure them against.
const EVENTS_RANGE = "2y";

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

/**
 * The close on the last session strictly before the event, and on the first
 * session strictly after it — the one-session reaction window. Bars are
 * ascending. Returns null if either leg is missing, which is what makes the
 * event unusable as an analog.
 */
function reactionWindow(
  bars: PriceBar[],
  eventDate: string,
): { before: number; after: number; volume: number | null } | null {
  let beforeIdx = -1;
  for (let i = 0; i < bars.length; i++) {
    if (bars[i].ts < eventDate) beforeIdx = i;
    else break;
  }
  const afterIdx = bars.findIndex((b) => b.ts > eventDate);
  if (beforeIdx === -1 || afterIdx === -1) return null;

  const before = bars[beforeIdx].close;
  const after = bars[afterIdx].close;
  if (before === null || after === null || Number(before) === 0) return null;

  const onDay = bars.find((b) => b.ts === eventDate);
  return { before: Number(before), after: Number(after), volume: onDay?.volume ?? null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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
          Array.isArray(p.config?.symbols) ? (p.config.symbols as string[]) : [],
        )
        .map((s) => s.toUpperCase()),
    ),
  );

  const results = [];

  for (const symbol of symbols) {
    try {
      const { data: bars } = await supabase
        .from("historical_prices")
        .select("ts, close, volume")
        .eq("symbol", symbol)
        .order("ts", { ascending: true });

      const priceBars = (bars ?? []) as PriceBar[];
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
            (e.eps !== null ? ` — EPS ${e.eps} vs consensus ${e.consensus ?? "n/a"}` : "") +
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
          description: `${symbol} traded ex-dividend — $${d.amount} per share`,
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
        dividends: yahoo.dividends.length,
        splits: yahoo.splits.length,
        upserted,
        skipped_no_price_window: skipped,
      });
    } catch (err) {
      results.push({ symbol, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return Response.json({ results }, { headers: corsHeaders });
});
