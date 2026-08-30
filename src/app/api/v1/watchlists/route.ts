import { createClient } from "@/lib/supabase/server";
import { apiError, jsonResponse, meta, readLimit, requireUser } from "@/lib/api/v1";

export async function GET(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const supabase = await createClient();
  const limit = readLimit(new URL(req.url), 50, 200);

  const { data: lists, error } = await supabase
    .from("watchlists")
    .select("id, name, description, sort_order, display_prefs")
    .eq("user_id", auth.user.id)
    .order("sort_order", { ascending: true })
    .limit(limit);
  if (error) {
    // Log the real Postgres/PostgREST error server-side; the client gets a
    // generic message, matching /api/chat.
    console.error("[api/v1/watchlists] watchlists query failed:", error);
    return apiError(500, "query_failed", "Could not load watchlists. Please try again.");
  }

  const ids = (lists ?? []).map((l) => l.id);
  const { data: items } = ids.length
    ? await supabase
        .from("watchlist_items")
        .select("watchlist_id, symbol, sort_order")
        .in("watchlist_id", ids)
        .order("sort_order", { ascending: true })
    : { data: [] };

  const bySymbolList = new Map<string, { symbol: string; sort_order: number }[]>();
  for (const item of items ?? []) {
    const arr = bySymbolList.get(item.watchlist_id) ?? [];
    arr.push({ symbol: item.symbol, sort_order: item.sort_order });
    bySymbolList.set(item.watchlist_id, arr);
  }

  return jsonResponse({
    data: (lists ?? []).map((l) => ({ ...l, items: bySymbolList.get(l.id) ?? [] })),
    meta: meta(),
  });
}
