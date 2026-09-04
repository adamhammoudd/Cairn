"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { readDisplayPrefs, type DisplayPrefs, type WatchlistWithItems } from "@/lib/watchlists";
import { validateSymbol, validateText } from "@/lib/validation";
import { ensureSymbolIngested } from "@/lib/market-data/ingest";
import { unwrapRows, MIGRATIONS } from "@/lib/supabase/read";

export type { WatchlistWithItems } from "@/lib/watchlists";

export async function listWatchlists(): Promise<WatchlistWithItems[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // A failed read here must not read as "you have no watchlists" - fail loud,
  // the same rule the Screener follows (see lib/supabase/read.ts).
  const lists = unwrapRows(
    "Watchlists",
    await supabase.from("watchlists").select("*").eq("user_id", user.id).order("sort_order", { ascending: true }),
  );

  if (lists.length === 0) return [];

  const items = unwrapRows(
    "Watchlist items",
    await supabase
      .from("watchlist_items")
      .select("*")
      .in(
        "watchlist_id",
        lists.map((l) => l.id),
      )
      .order("sort_order", { ascending: true }),
  );

  const symbols = Array.from(new Set(items.map((i) => i.symbol)));

  // 30 most recent closes per symbol drive both the sparkline and the % change.
  //
  // `.limit(symbols.length * 30)` looked per-symbol but was not: the rows
  // interleave by date, so a coin with a bar every weekend day consumes the
  // budget and an equity in the same list ends up with fewer than 30 - or, at
  // the tail, none, which renders as a flat "-" with no error. recent_prices()
  // puts the LIMIT inside a lateral join, one per symbol.
  const prices =
    symbols.length > 0
      ? unwrapRows(
          "Watchlist price history (recent_prices)",
          await supabase.rpc("recent_prices", { symbols, per_symbol: 30 }),
          MIGRATIONS.onDemandIngestion,
        )
      : [];

  const bySymbol = new Map<string, number[]>();
  const asOfBySymbol = new Map<string, string>();
  for (const p of prices as { symbol: string; ts: string; close: number | null }[]) {
    if (p.close === null) continue;
    const arr = bySymbol.get(p.symbol) ?? [];
    if (arr.length === 0) asOfBySymbol.set(p.symbol, p.ts);
    if (arr.length < 30) arr.push(Number(p.close));
    bySymbol.set(p.symbol, arr);
  }

  // Crypto items carry CoinGecko's rolling 24h change, the same figure Markets
  // and the ticker page show, instead of a close-to-close delta.
  const coinRows = unwrapRows(
    "Watchlist crypto metrics",
    await supabase.from("crypto_metrics").select("symbol, price_change_24h_pct").in("symbol", symbols),
  );
  const rolling = new Map(coinRows.filter((c) => c.price_change_24h_pct != null).map((c) => [c.symbol, Number(c.price_change_24h_pct)]));

  return lists.map((l) => ({
    id: l.id,
    name: l.name,
    description: l.description,
    displayPrefs: readDisplayPrefs(l.display_prefs),
    sort_order: l.sort_order,
    items: items
      .filter((i) => i.watchlist_id === l.id)
      .map((i) => {
        const desc = bySymbol.get(i.symbol) ?? [];
        const latestClose = desc[0] ?? null;
        const prev = desc[1] ?? null;
        const closeToClose = latestClose !== null && prev !== null && prev !== 0 ? ((latestClose - prev) / prev) * 100 : null;
        return {
          id: i.id,
          symbol: i.symbol,
          sort_order: i.sort_order,
          latestClose,
          changePct: rolling.get(i.symbol) ?? closeToClose,
          asOf: asOfBySymbol.get(i.symbol) ?? null,
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

  // A symbol with no price history renders a dead row of "- - -", so it is
  // rejected - but "not tracked yet" is no longer a reason on its own: the
  // symbol is fetched on the spot, exactly as the search box does. Ordered
  // after the auth and ownership checks so an unauthenticated caller cannot
  // use this action to make Cairn issue outbound requests.
  const { data: tracked } = await supabase
    .from("symbol_directory")
    .select("symbol")
    .eq("symbol", symbol)
    .eq("status", "available")
    .maybeSingle();
  if (!tracked) {
    const ingested = await ensureSymbolIngested(symbol);
    if (ingested.status !== "available") {
      return ingested.status === "rate_limited"
        ? `Couldn't check ${symbol} just now - the market data provider is rate-limiting. Try again shortly.`
        : `No market data is available for ${symbol}, so it has no price history to show.`;
    }
  }

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
  const ownedIds = unwrapRows(
    "Watchlist ownership check",
    await supabase.from("watchlists").select("id").eq("user_id", user.id),
  );
  await supabase
    .from("watchlist_items")
    .delete()
    .eq("id", id)
    .in("watchlist_id", ownedIds.map((w) => w.id));

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
  const ownedIds = unwrapRows(
    "Watchlist ownership check",
    await supabase.from("watchlists").select("id").eq("user_id", user.id),
  );
  const owned = ownedIds.map((w) => w.id);

  await Promise.all(
    orderedIds.map((id, index) =>
      supabase.from("watchlist_items").update({ sort_order: index }).eq("id", id).in("watchlist_id", owned),
    ),
  );

  revalidatePath("/watchlists");
}
