// Scheduled Edge Function: pulls forward-looking earnings, ex-dividend, and
// split dates from Nasdaq's public calendar API into calendar_events.
//
// Keyless, but it is an undocumented public endpoint rather than a contracted
// API - it rejects requests without a browser-like User-Agent and could change
// shape without notice, so every row is defensively parsed and a failed day is
// reported rather than aborting the run.
//
// Not covered: economic releases and IPO pricing. Nasdaq's IPO endpoint returned
// nothing usable for a forward window and no keyless economic-calendar feed was
// found (the Fed's calendar.json is a historical archive). Those two event_types
// stay empty until a provider is added.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { requireCronSecret } from "../_shared/auth.ts";

const UA = "Mozilla/5.0 (compatible; cairn-ingest/1.0)";
const DAYS_AHEAD = 21;

interface EventRow {
  symbol: string | null;
  event_type: string;
  event_date: string;
  title: string;
  metadata: Record<string, unknown>;
}

async function nasdaqJson(url: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function isoDate(offsetDays: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

// Nasdaq returns dates as M/D/YYYY in some payloads and ISO in others.
function normalizeDate(raw: string | undefined, fallback: string): string {
  if (!raw) return fallback;
  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const [, m, d, y] = slash;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : fallback;
}

async function fetchEarnings(date: string): Promise<EventRow[]> {
  const json = await nasdaqJson(`https://api.nasdaq.com/api/calendar/earnings?date=${date}`);
  const rows = (json?.data as { rows?: Record<string, string>[] } | undefined)?.rows ?? [];
  return rows
    .filter((r) => r.symbol)
    .map((r) => ({
      symbol: r.symbol.toUpperCase(),
      event_type: "earnings",
      event_date: date,
      title: `${r.name ?? r.symbol} - quarterly earnings`,
      metadata: { source: "nasdaq", eps_forecast: r.epsForecast ?? null, time: r.time ?? null },
    }));
}

async function fetchDividends(date: string): Promise<EventRow[]> {
  const json = await nasdaqJson(`https://api.nasdaq.com/api/calendar/dividends?date=${date}`);
  const calendar = (json?.data as { calendar?: { rows?: Record<string, string>[] } } | undefined)?.calendar;
  const rows = calendar?.rows ?? [];
  return rows
    .filter((r) => r.symbol)
    .map((r) => ({
      symbol: r.symbol.toUpperCase(),
      event_type: "dividend",
      event_date: normalizeDate(r.dividend_Ex_Date, date),
      title: `${r.companyName ?? r.symbol} - ex-dividend`,
      metadata: { source: "nasdaq", rate: r.dividend_Rate ?? null, payment_date: r.payment_Date ?? null },
    }));
}

async function fetchSplits(): Promise<EventRow[]> {
  const json = await nasdaqJson("https://api.nasdaq.com/api/calendar/splits");
  const rows = (json?.data as { rows?: Record<string, string>[] } | undefined)?.rows ?? [];
  const today = isoDate(0);
  return rows
    .filter((r) => r.symbol && r.executionDate)
    .map((r) => ({
      symbol: r.symbol.toUpperCase(),
      event_type: "split",
      event_date: normalizeDate(r.executionDate, today),
      title: `${r.name ?? r.symbol} - ${r.ratio ?? "stock"} split effective`,
      metadata: { source: "nasdaq", ratio: r.ratio ?? null },
    }))
    .filter((e) => e.event_date >= today);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  // Scheduled callers must present the shared secret; see _shared/auth.ts.
  const unauthorized = requireCronSecret(req);
  if (unauthorized) return unauthorized;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Only track symbols the app actually has price history for - Nasdaq returns
  // hundreds of names per day and the calendar is only useful next to data we hold.
  const { data: providers } = await supabase
    .from("data_providers")
    .select("config")
    .eq("provider_type", "market_data")
    .eq("enabled", true);

  const tracked = new Set(
    (providers ?? [])
      .flatMap((p: { config: Record<string, unknown> }) => {
        // config.symbols accepts plain strings and { symbol, asset_type }
        // objects (see ingest-market-data). Only the ticker matters here.
        const syms = Array.isArray(p.config?.symbols) ? (p.config.symbols as unknown[]) : [];
        return syms
          .map((s) => (typeof s === "string" ? s : (s as { symbol?: string })?.symbol))
          .filter((s): s is string => typeof s === "string");
      })
      .map((s) => s.toUpperCase()),
  );

  const collected: EventRow[] = [];
  const failures: string[] = [];

  for (let i = 0; i < DAYS_AHEAD; i++) {
    const date = isoDate(i);
    const [earnings, dividends] = await Promise.all([fetchEarnings(date), fetchDividends(date)]);
    if (earnings.length === 0 && dividends.length === 0) failures.push(date);
    collected.push(...earnings, ...dividends);
  }
  collected.push(...(await fetchSplits()));

  const relevant = collected.filter((e) => e.symbol && tracked.has(e.symbol));

  // Replace this source's rows rather than accumulating duplicates across runs.
  await supabase.from("calendar_events").delete().eq("metadata->>source", "nasdaq");

  let inserted = 0;
  if (relevant.length > 0) {
    const { error } = await supabase.from("calendar_events").insert(relevant);
    if (!error) inserted = relevant.length;
    else return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
  }

  return Response.json(
    {
      tracked_symbols: Array.from(tracked),
      fetched: collected.length,
      inserted,
      days_with_no_data: failures.length,
    },
    { headers: corsHeaders },
  );
});
