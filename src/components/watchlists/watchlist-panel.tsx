"use client";

import Link from "next/link";
import { useActionState, useMemo, useState, useTransition } from "react";
import {
  addWatchlistItem,
  deleteWatchlist,
  removeWatchlistItem,
  reorderWatchlistItems,
  type WatchlistWithItems,
} from "@/lib/actions/watchlists";
import { Sparkline } from "@/components/watchlists/sparkline";

function fmtCurrency(n: number | null) {
  if (n === null) return "—";
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export function WatchlistPanel({ watchlists }: { watchlists: WatchlistWithItems[] }) {
  const [activeId, setActiveId] = useState(watchlists[0]?.id ?? null);
  const [addError, addAction] = useActionState(addWatchlistItem, null);
  const [, startMutate] = useTransition();
  const [dragId, setDragId] = useState<string | null>(null);

  const active = watchlists.find((w) => w.id === activeId) ?? watchlists[0] ?? null;

  const sortedItems = useMemo(() => {
    if (!active) return [];
    const items = [...active.items];
    switch (active.displayPrefs.sortBy) {
      case "symbol":
        return items.sort((a, b) => a.symbol.localeCompare(b.symbol));
      case "price":
        return items.sort((a, b) => (b.latestClose ?? -Infinity) - (a.latestClose ?? -Infinity));
      case "change":
        return items.sort((a, b) => (b.changePct ?? -Infinity) - (a.changePct ?? -Infinity));
      default:
        return items; // manual -- already sort_order from the query
    }
  }, [active]);

  const manualSort = active?.displayPrefs.sortBy === "manual";

  function handleDrop(targetId: string) {
    if (!active || !dragId || dragId === targetId || !manualSort) return;
    const ids = active.items.map((i) => i.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from === -1 || to === -1) return;

    ids.splice(to, 0, ids.splice(from, 1)[0]);
    setDragId(null);
    startMutate(() => reorderWatchlistItems(ids));
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        {watchlists.map((w) => (
          <button
            key={w.id}
            type="button"
            onClick={() => setActiveId(w.id)}
            className={`rounded-lg px-4 py-2 text-[13.5px] transition-colors duration-fast ease-standard ${
              active?.id === w.id ? "bg-active text-primary" : "text-muted hover:text-primary"
            }`}
          >
            {w.name}
          </button>
        ))}
      </div>

      {!active ? (
        <div className="rounded-card border border-dashed border-line p-12 text-center text-sm text-muted">
          No watchlists yet. Create one below to start tracking symbols.
        </div>
      ) : (
        <>
          {active.description && <p className="text-[13px] text-muted">{active.description}</p>}

          <form action={addAction} className="flex items-center gap-2">
            <input type="hidden" name="watchlist_id" value={active.id} />
            <input
              name="symbol"
              placeholder="Add symbol (e.g. NVDA)"
              className="w-52 rounded-lg border border-line bg-active px-3 py-2 text-[13px] text-primary uppercase outline-none"
            />
            <button type="submit" className="rounded-lg border border-line px-3.5 py-2 text-[13px] text-primary transition-colors duration-fast ease-standard hover:bg-active">
              Add
            </button>
          </form>
          {addError && addError !== "saved" && <p className="text-[13px] text-negative">{addError}</p>}

          {sortedItems.length === 0 ? (
            <div className="rounded-card border border-dashed border-line p-12 text-center text-sm text-muted">
              No symbols in this list yet.
            </div>
          ) : (
            <>
              <div className="overflow-hidden rounded-card border border-line bg-panel">
                <div
                  className={`grid ${active.displayPrefs.showSparkline ? "grid-cols-[24px_1.4fr_0.9fr_0.8fr_110px_60px]" : "grid-cols-[24px_1.4fr_0.9fr_0.8fr_60px]"} border-b border-line px-5 py-3.5 text-[11.5px] tracking-[0.06em] text-muted uppercase`}
                >
                <div />
                <div>Symbol</div>
                <div>Price</div>
                <div>Change</div>
                {active.displayPrefs.showSparkline && <div>Trend (30d)</div>}
                <div />
              </div>
              {sortedItems.map((item) => (
                <div
                  key={item.id}
                  draggable={manualSort}
                  onDragStart={() => setDragId(item.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDrop(item.id)}
                  className={`grid ${active.displayPrefs.showSparkline ? "grid-cols-[24px_1.4fr_0.9fr_0.8fr_110px_60px]" : "grid-cols-[24px_1.4fr_0.9fr_0.8fr_60px]"} items-center border-b border-line px-5 py-3.5 last:border-b-0 ${
                    dragId === item.id ? "opacity-50" : ""
                  }`}
                >
                  <div className={`text-[14px] text-muted select-none ${manualSort ? "cursor-grab" : "opacity-30"}`}>⠿</div>
                  <Link href={`/ticker/${item.symbol}`} className="text-sm text-primary hover:text-accent">
                    {item.symbol}
                  </Link>
                  <div className="text-[13.5px] text-primary">{fmtCurrency(item.latestClose)}</div>
                  <div
                    className={`text-[13px] ${
                      item.changePct === null ? "text-muted" : item.changePct >= 0 ? "text-accent" : "text-negative"
                    }`}
                  >
                    {item.changePct === null
                      ? "—"
                      : `${item.changePct >= 0 ? "+" : ""}${item.changePct.toFixed(2)}%`}
                  </div>
                  {active.displayPrefs.showSparkline && (
                    <Sparkline values={item.sparkline} positive={(item.changePct ?? 0) >= 0} />
                  )}
                  <button
                    type="button"
                    onClick={() => startMutate(() => removeWatchlistItem(item.id))}
                    className="text-[12.5px] text-muted hover:text-negative"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-card border border-line bg-panel p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[13px] text-muted">Delete this list when you're done with it.</p>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`Delete the "${active.name}" list?`)) {
                      startMutate(() => deleteWatchlist(active.id));
                    }
                  }}
                  className="rounded-lg border border-negative px-3.5 py-2 text-[13px] text-negative transition-colors duration-fast ease-standard hover:bg-negative/10"
                >
                  Delete list
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <div>
        <Link
          href="/watchlists/new"
          className="inline-block rounded-lg px-4 py-2 text-[13.5px] font-semibold text-canvas transition-opacity duration-fast ease-standard hover:opacity-90"
          style={{ background: "linear-gradient(135deg, #5EE6A6, #22B573)" }}
        >
          + New watchlist
        </Link>
      </div>
    </div>
  );
}
