"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface WatchlistItemWithData {
  id: string;
  symbol: string;
  sort_order: number;
  latestClose: number | null;
  changePct: number | null;
  sparkline: number[];
}

export interface WatchlistWithItems {
  id: string;
  name: string;
  sort_order: number;
  items: WatchlistItemWithData[];
}

export async function listWatchlists(): Promise<WatchlistWithItems[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: lists } = await supabase
    .from("watchlists")
    .select("*")
    .eq("user_id", user.id)
    .order("sort_order", { ascending: true });

  if (!lists || lists.length === 0) return [];

  const { data: items } = await supabase
    .from("watchlist_items")
    .select("*")
    .in(
      "watchlist_id",
      lists.map((l) => l.id),
    )
    .order("sort_order", { ascending: true });

  const symbols = Array.from(new Set((items ?? []).map((i) => i.symbol)));

  // 30 most recent closes per symbol drive both the sparkline and the % change.
  const { data: prices } =
    symbols.length > 0
      ? await supabase
          .from("historical_prices")
          .select("symbol, ts, close")
          .in("symbol", symbols)
          .order("ts", { ascending: false })
          .limit(symbols.length * 30)
      : { data: [] };

  const bySymbol = new Map<string, number[]>();
  for (const p of prices ?? []) {
    if (p.close === null) continue;
    const arr = bySymbol.get(p.symbol) ?? [];
    if (arr.length < 30) arr.push(p.close);
    bySymbol.set(p.symbol, arr);
  }

  return lists.map((l) => ({
    id: l.id,
    name: l.name,
    sort_order: l.sort_order,
    items: (items ?? [])
      .filter((i) => i.watchlist_id === l.id)
      .map((i) => {
        const desc = bySymbol.get(i.symbol) ?? [];
        const latestClose = desc[0] ?? null;
        const prev = desc[1] ?? null;
        return {
          id: i.id,
          symbol: i.symbol,
          sort_order: i.sort_order,
          latestClose,
          changePct: latestClose !== null && prev !== null && prev !== 0 ? ((latestClose - prev) / prev) * 100 : null,
          sparkline: [...desc].reverse(),
        };
      }),
  }));
}

export async function createWatchlist(_prevState: string | null, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return "Enter a name for the list.";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { count } = await supabase
    .from("watchlists")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id);

  const { error } = await supabase
    .from("watchlists")
    .insert({ user_id: user.id, name, sort_order: count ?? 0 });
  if (error) return error.message;

  revalidatePath("/watchlists");
  return "saved";
}

export async function deleteWatchlist(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase.from("watchlists").delete().eq("id", id).eq("user_id", user.id);
  revalidatePath("/watchlists");
}

export async function addWatchlistItem(_prevState: string | null, formData: FormData) {
  const watchlistId = String(formData.get("watchlist_id") ?? "");
  const symbol = String(formData.get("symbol") ?? "").trim().toUpperCase();
  if (!watchlistId || !symbol) return "Enter a symbol.";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // RLS on watchlist_items joins through watchlists.user_id, so a foreign
  // watchlist_id is rejected by the database rather than trusted here.
  const { count } = await supabase
    .from("watchlist_items")
    .select("*", { count: "exact", head: true })
    .eq("watchlist_id", watchlistId);

  const { error } = await supabase
    .from("watchlist_items")
    .insert({ watchlist_id: watchlistId, symbol, sort_order: count ?? 0 });
  if (error) return error.message;

  revalidatePath("/watchlists");
  return "saved";
}

export async function removeWatchlistItem(id: string) {
  const supabase = await createClient();
  await supabase.from("watchlist_items").delete().eq("id", id);
  revalidatePath("/watchlists");
}

export async function reorderWatchlistItems(orderedIds: string[]) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await Promise.all(
    orderedIds.map((id, index) => supabase.from("watchlist_items").update({ sort_order: index }).eq("id", id)),
  );

  revalidatePath("/watchlists");
}
