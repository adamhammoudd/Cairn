import { createClient } from "@/lib/supabase/server";
import { apiError, jsonResponse, meta, readLimit, requireUser } from "@/lib/api/v1";

export async function GET(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const url = new URL(req.url);
  const limit = readLimit(url);
  const supabase = await createClient();

  const { data: holdings, error } = await supabase
    .from("holdings")
    .select("id, symbol, asset_type, quantity, purchase_price, purchase_date, sector, asset_class, geography, notes")
    .eq("user_id", auth.user.id)
    .order("symbol", { ascending: true })
    .limit(limit);
  if (error) return apiError(500, "query_failed", error.message);

  const symbols = Array.from(new Set((holdings ?? []).map((h) => h.symbol)));
  // One bar per symbol through the lateral-join RPC, not a shared LIMIT across
  // all of them - the same reason every other surface uses recent_prices().
  const { data: prices } = symbols.length
    ? await supabase.rpc("recent_prices", { symbols, per_symbol: 1 })
    : { data: [] };
  const latest = new Map(
    ((prices ?? []) as { symbol: string; ts: string; close: number | null }[]).map((p) => [p.symbol, p]),
  );

  const data = (holdings ?? []).map((h) => {
    const bar = latest.get(h.symbol);
    const price = bar?.close === null || bar?.close === undefined ? null : Number(bar.close);
    const quantity = Number(h.quantity);
    const cost = quantity * Number(h.purchase_price);
    const value = price === null ? null : quantity * price;
    return {
      id: h.id,
      symbol: h.symbol,
      asset_type: h.asset_type,
      quantity,
      purchase_price: Number(h.purchase_price),
      purchase_date: h.purchase_date,
      sector: h.sector,
      asset_class: h.asset_class,
      geography: h.geography,
      notes: h.notes,
      cost_basis: cost,
      last_close: price,
      last_close_date: bar?.ts ?? null,
      market_value: value,
      unrealized_gain: value === null ? null : value - cost,
      unrealized_gain_pct: value === null || cost === 0 ? null : ((value - cost) / cost) * 100,
    };
  });

  return jsonResponse({
    data,
    meta: meta({
      price_basis: "Last stored daily close. No live-quote provider is configured, so these are not real-time prices.",
    }),
  });
}
