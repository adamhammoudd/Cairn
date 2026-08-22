import { createClient } from "@/lib/supabase/server";
import { ensureSymbolIngested } from "@/lib/market-data/ingest";
import { apiError, jsonResponse, meta, readLimit, requireUser } from "@/lib/api/v1";

export async function GET(req: Request, { params }: { params: Promise<{ symbol: string }> }) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const { symbol: raw } = await params;
  const symbol = decodeURIComponent(raw).trim().toUpperCase();
  const limit = readLimit(new URL(req.url), 100, 500);
  const supabase = await createClient();

  // Newest-first at the database so the LIMIT keeps the most recent bars, then
  // reversed for the caller. Ascending with a LIMIT returns the oldest rows.
  let { data: bars } = await supabase
    .from("historical_prices")
    .select("ts, open, high, low, close, volume")
    .eq("symbol", symbol)
    .order("ts", { ascending: false })
    .limit(limit);

  if (!bars || bars.length === 0) {
    // Same on-demand path the UI uses: a symbol nobody has asked for yet is
    // fetched now rather than reported as unknown.
    const ingested = await ensureSymbolIngested(symbol);
    if (ingested.status !== "available") {
      const status = ingested.status === "rate_limited" ? 429 : ingested.status === "error" ? 502 : 404;
      return apiError(status, ingested.status, ingested.detail ?? `No market data available for ${symbol}.`);
    }
    ({ data: bars } = await supabase
      .from("historical_prices")
      .select("ts, open, high, low, close, volume")
      .eq("symbol", ingested.symbol)
      .order("ts", { ascending: false })
      .limit(limit));
  }

  const { data: directory } = await supabase
    .from("symbol_directory")
    .select("symbol, name, asset_type, status, last_success_at")
    .eq("symbol", symbol)
    .maybeSingle();

  const ascending = (bars ?? [])
    .slice()
    .reverse()
    .map((b) => ({
      ts: b.ts,
      open: b.open === null ? null : Number(b.open),
      high: b.high === null ? null : Number(b.high),
      low: b.low === null ? null : Number(b.low),
      close: b.close === null ? null : Number(b.close),
      volume: b.volume === null ? null : Number(b.volume),
    }));

  return jsonResponse({
    data: {
      symbol,
      name: directory?.name ?? null,
      asset_type: directory?.asset_type ?? null,
      bars: ascending,
      count: ascending.length,
    },
    meta: meta({ price_basis: "Stored daily bars, oldest first. Not real-time." }),
  });
}
