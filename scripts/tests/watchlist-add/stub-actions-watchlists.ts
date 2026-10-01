// Stand-in for src/lib/actions/watchlists.ts in the watchlist-add browser
// test. Same signatures; storage is in-memory. addWatchlistItem runs the REAL
// validateSymbol, so an empty submit fails with the production message
// ("Enter a symbol."), which is the failure this test exists to catch.
import { validateSymbol } from "@/lib/validation";
import type { WatchlistWithItems } from "@/lib/watchlists";

export type { WatchlistWithItems } from "@/lib/watchlists";

export const store = {
  lists: [] as WatchlistWithItems[],
  /** Every `symbol` value the form actually POSTed, in order. */
  submitted: [] as string[],
  /** Set by the harness; stands in for revalidatePath re-rendering the page. */
  onChange: () => {},
};

export async function addWatchlistItem(_prevState: string | null, formData: FormData) {
  const raw = String(formData.get("symbol") ?? "");
  store.submitted.push(raw);
  const parsed = validateSymbol(raw);
  if (!parsed.ok) return parsed.error ?? "Enter a valid symbol.";
  const list = store.lists.find((l) => l.id === String(formData.get("watchlist_id")));
  if (!list) return "That watchlist doesn't exist.";
  list.items.push({
    id: `${list.id}-${parsed.value}`,
    symbol: parsed.value,
    sort_order: list.items.length,
    latestClose: 100,
    asOf: "2026-09-25",
    currency: "USD",
    changePct: 1,
    sparkline: [],
  });
  store.onChange();
  return "saved";
}

export async function deleteWatchlist() {}
export async function removeWatchlistItem() {}
export async function reorderWatchlistItems() {}
