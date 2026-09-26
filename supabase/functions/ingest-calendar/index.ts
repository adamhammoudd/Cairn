// Scheduled Edge Function: pulls forward-looking earnings, ex-dividend, and
// split dates from Nasdaq's public calendar API into calendar_events.
//
// Keyless, but it is an undocumented public endpoint rather than a contracted
// API - it rejects requests without a browser-like User-Agent and could change
// shape without notice, so every row is defensively parsed and a failed day is
// reported rather than aborting the run.
//
// Where Nasdaq has no earnings date for a tracked company inside the window,
// an ESTIMATE is added from the company's own SEC release history (see
// _shared/earnings-estimate.ts), stored with metadata.source = "sec_estimate"
// and confirmed = false, and labelled as an estimate wherever it is shown.
//
// LICENSING: Nasdaq.com's terms (nasdaq.com/legal, updated 2026-05-11) grant
// a "personal, non-commercial use" licence and prohibit any automated process
// that captures data from the Service. Cairn is a paid product. Setting
// CALENDAR_NASDAQ_ENABLED=false stops every Nasdaq call and removes its rows;
// the SEC estimates keep working without it. Pending cfo-legal-advisor review.
//
// Not covered: economic releases and IPO pricing. Nasdaq's IPO endpoint returned
// nothing usable for a forward window and no keyless economic-calendar feed was
// found (the Fed's calendar.json is a historical archive). Those two event_types
// stay empty until a provider is added.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { requireCronSecret } from "../_shared/auth.ts";
import { trackedSymbols, withEstimates, type CalendarRow } from "../_shared/earnings-estimate.ts";

const UA = "Mozilla/5.0 (compatible; cairn-ingest/1.0)";
// As far ahead as the scorecard looks for a next event
// (THRESHOLDS.nextEvent.horizonDays). At 21 days most companies' next
// results, weeks away, were never fetched.
const DAYS_AHEAD = 60;
// Days fetched at once (two requests each), with a pause between batches, so
// 60 days stay well inside the function's time limit without a burst of 120.
const DAYS_PER_BATCH = 6;
const BATCH_PAUSE_MS = 300;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type EventRow = CalendarRow;

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

  // Only track symbols the app has data for - Nasdaq returns hundreds of names
  // per day and the calendar is only useful next to data we hold. Held and
  // watched symbols count too: ISRG was held but not on the provider list, so
  // it could never get a date.
  const [{ data: providers }, { data: held }, { data: watched }] = await Promise.all([
    supabase.from("data_providers").select("config").eq("provider_type", "market_data").eq("enabled", true),
    supabase.from("holdings").select("symbol"),
    supabase.from("watchlist_items").select("symbol"),
  ]);
  const tracked = trackedSymbols(providers ?? [], held ?? [], watched ?? []);

  const nasdaqEnabled = (Deno.env.get("CALENDAR_NASDAQ_ENABLED") ?? "true").toLowerCase() !== "false";
  const collected: EventRow[] = [];
  const failures: string[] = [];

  if (nasdaqEnabled) {
    for (let start = 0; start < DAYS_AHEAD; start += DAYS_PER_BATCH) {
      const batch = Array.from({ length: Math.min(DAYS_PER_BATCH, DAYS_AHEAD - start) }, (_, k) => isoDate(start + k));
      const results = await Promise.all(
        batch.map(async (date) => {
          const [earnings, dividends] = await Promise.all([fetchEarnings(date), fetchDividends(date)]);
          return { date, earnings, dividends };
        }),
      );
      for (const { date, earnings, dividends } of results) {
        if (earnings.length === 0 && dividends.length === 0) failures.push(date);
        collected.push(...earnings, ...dividends);
      }
      await sleep(BATCH_PAUSE_MS);
    }
    collected.push(...(await fetchSplits()));
  }

  const relevant = collected.filter((e) => e.symbol && tracked.has(e.symbol));

  // Nasdaq's API rejects datacenter IPs intermittently, and a blocked run comes
  // back as an empty fetch, not an error. The old code deleted every existing
  // `source=nasdaq` row unconditionally and only re-inserted when `relevant`
  // was non-empty - so one blocked run wiped the calendar and left it empty
  // until a run happened to get through. Only touch the table when the fetch
  // clearly worked: at least one day in the window returned rows.
  const fetchWorked = nasdaqEnabled && failures.length < DAYS_AHEAD;

  let inserted = 0;
  if (fetchWorked) {
    // Replace this source's rows rather than accumulating duplicates across runs.
    await supabase.from("calendar_events").delete().eq("metadata->>source", "nasdaq");
    if (relevant.length > 0) {
      const { error } = await supabase.from("calendar_events").insert(relevant);
      if (error) return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
      inserted = relevant.length;
    }
  } else if (!nasdaqEnabled) {
    // Switched off: stale Nasdaq rows must not linger as if current.
    await supabase.from("calendar_events").delete().eq("metadata->>source", "nasdaq");
  }

  // SEC estimates for tracked companies Nasdaq has no earnings date for.
  // Checked against the Nasdaq rows actually in the table, so a blocked Nasdaq
  // run (rows kept from the last good run) does not add duplicates.
  const today = isoDate(0);
  const [{ data: nasdaqNow }, { data: releaseRows }] = await Promise.all([
    supabase
      .from("calendar_events")
      .select("symbol, event_type, event_date, title, metadata")
      .eq("metadata->>source", "nasdaq")
      .gte("event_date", today),
    supabase
      .from("earnings_releases")
      .select("symbol, release_date")
      .in("symbol", [...tracked])
      .gte("release_date", isoDate(-3 * 365)),
  ]);
  const releasesBySymbol: Record<string, string[]> = {};
  for (const r of (releaseRows ?? []) as { symbol: string; release_date: string }[]) {
    (releasesBySymbol[r.symbol] ??= []).push(String(r.release_date));
  }
  const estimates = withEstimates((nasdaqNow ?? []) as EventRow[], releasesBySymbol, today, DAYS_AHEAD).filter(
    (e) => e.metadata.source === "sec_estimate",
  );
  await supabase.from("calendar_events").delete().eq("metadata->>source", "sec_estimate");
  if (estimates.length > 0) {
    const { error } = await supabase.from("calendar_events").insert(estimates);
    if (error) return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
  }

  return Response.json(
    {
      tracked_symbols: Array.from(tracked),
      fetched: collected.length,
      inserted,
      days_with_data: DAYS_AHEAD - failures.length,
      days_with_no_data: failures.length,
      write_skipped: !fetchWorked,
      nasdaq_enabled: nasdaqEnabled,
      sec_estimates: estimates.map((e) => `${e.symbol} ${e.event_date}`),
    },
    { headers: corsHeaders },
  );
});
