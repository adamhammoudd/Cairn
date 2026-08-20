"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { readDisplayPrefs, type DisplayPrefs, type WatchlistWithItems } from "@/lib/watchlists";
import { validateSymbol, validateText } from "@/lib/validation";

export type { WatchlistWithItems } from "@/lib/watchlists";

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
    description: l.description,
    displayPrefs: readDisplayPrefs(l.display_prefs),
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
  const parsedName = validateText(formData.get("name"), "Name", { max: 80, min: 1 });
  if (!parsedName.ok) return parsedName.error ?? "Enter a name.";
  const name = parsedName.value;

  const parsedDescription = validateText(formData.get("description") ?? "", "Description", { max: 280 });
  if (!parsedDescription.ok) return parsedDescription.error ?? "Description is too long.";
  const description = parsedDescription.value || null;
  const displayPrefs: DisplayPrefs = {
    sortBy: readDisplayPrefs({ sortBy: formData.get("sort_by") }).sortBy,
    showSparkline: formData.get("show_sparkline") === "on",
  };

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
    .insert({
      user_id: user.id,
      name,
      description,
      display_prefs: displayPrefs as unknown as Record<string, unknown>,
      sort_order: count ?? 0,
    });
  if (error) return error.message;

  revalidatePath("/watchlists");
  redirect("/watchlists");
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
  if (!watchlistId) return "Enter a symbol.";

  // Shape validation happens here, not only in the picker. A server action is
  // an HTTP endpoint - the component is not in the way of a POST. "ZZQQ9!!"
  // was accepted and stored as a permanent dead row precisely because nothing
  // checked on this side.
  const parsed = validateSymbol(formData.get("symbol"));
  if (!parsed.ok) return parsed.error ?? "Enter a valid symbol.";
  const symbol = parsed.value;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Ownership is established here, in the action, rather than left to RLS
  // alone. RLS does join watchlist_items through watchlists.user_id and does
  // reject a foreign id -- verified in supabase/tests/rls_idor.sql -- but a
  // policy is a backstop, not the authorization decision. Checking here also
  // turns a silent zero-row no-op into an explicit denial the caller can see.
  const { data: owned } = await supabase
    .from("watchlists")
    .select("id")
    .eq("id", watchlistId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!owned) return "That watchlist doesn't exist.";

  // A well-formed but untracked symbol renders the same dead row, so it is
  // rejected too - with a message that distinguishes the two cases. Ordered
  // after the auth and ownership checks so an unauthenticated caller cannot
  // use this action to probe which symbols exist.
  const { data: tracked } = await supabase
    .from("historical_prices")
    .select("symbol")
    .eq("symbol", symbol)
    .limit(1)
    .maybeSingle();
  if (!tracked) return `${symbol} isn't tracked yet, so it has no price history to show.`;

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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Deletes only where the parent watchlist is the caller's. This was the one
  // mutating action in the file with no auth.getUser() call at all, relying
  // entirely on RLS to stop a foreign (or anonymous) id.
  const { data: ownedIds } = await supabase.from("watchlists").select("id").eq("user_id", user.id);
  await supabase
    .from("watchlist_items")
    .delete()
    .eq("id", id)
    .in("watchlist_id", (ownedIds ?? []).map((w) => w.id));

  revalidatePath("/watchlists");
}

export async function reorderWatchlistItems(orderedIds: string[]) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Same reasoning as removeWatchlistItem: constrain every update to items
  // whose parent watchlist belongs to the caller, so a forged id list cannot
  // reshuffle someone else's watchlist even if a policy regresses.
  const { data: ownedIds } = await supabase.from("watchlists").select("id").eq("user_id", user.id);
  const owned = (ownedIds ?? []).map((w) => w.id);

  await Promise.all(
    orderedIds.map((id, index) =>
      supabase.from("watchlist_items").update({ sort_order: index }).eq("id", id).in("watchlist_id", owned),
    ),
  );

  revalidatePath("/watchlists");
}
