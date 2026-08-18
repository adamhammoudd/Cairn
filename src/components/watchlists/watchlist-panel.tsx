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
import { tintForWatchlist } from "@/lib/watchlists";
import { Sparkline } from "@/components/sparkline";

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
  const showSparkline = active?.displayPrefs.showSparkline ?? false;
  const cols = showSparkline
    ? "grid-cols-[24px_1.7fr_1fr_0.9fr_100px_44px]"
    : "grid-cols-[24px_1.7fr_1fr_0.9fr_44px]";

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
    <div>
      <div>
        <div>Watchlists</div>
        <h1>
          {active?.name ?? "Watchlists"}
        </h1>
        {active?.description && <p>{active.description}</p>}
      </div>

      {watchlists.length > 0 && (
        <div>
          {watchlists.map((w) => {
            const isActive = active?.id === w.id;
            return (
              <button
                key={w.id}
                type="button"
                onClick={() => setActiveId(w.id)}

 >
                <span />
                <span>{w.name}</span>
                <span>{w.items.length}</span>
              </button>
            );
          })}
        </div>
      )}

      {!active ? (
        <div>
          <div>No lists marked out yet</div>
          <p>
            Group the tickers you&apos;re tracking but don&apos;t own yet, and Cairn keeps their prices and trends
            beside your portfolio.
          </p>
        </div>
      ) : (
        <>
          <form action={addAction}>
            <input type="hidden" name="watchlist_id" value={active.id} />
            <input
              name="symbol"
              placeholder="Add symbol (e.g. NVDA)"

 />
            <button
              type="submit"

 >
              Add
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Delete the "${active.name}" list?`)) {
                  startMutate(() => deleteWatchlist(active.id));
                }
              }}

 >
              Delete list
            </button>
          </form>
          {addError && addError !== "saved" && <p>{addError}</p>}

          {sortedItems.length === 0 ? (
            <div>
              <div>Nothing on this list yet</div>
              <p>
                Add a symbol above to start tracking its price and 30-day trend.
              </p>
            </div>
          ) : (
            <div>
              <div>
                <div>
                  <div

 >
                    <div />
                    <div>Symbol</div>
                    <div>Price</div>
                    <div>24h</div>
                    {showSparkline && <div>30d</div>}
                    <div />
                  </div>

                  {sortedItems.map((item, index) => {
                    const positive = (item.changePct ?? 0) >= 0;
                    return (
                      <div
                        key={item.id}
                        draggable={manualSort}
                        onDragStart={() => setDragId(item.id)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => handleDrop(item.id)}

 >
                        <div

 >
                          ⠿
                        </div>

                        <Link href={`/ticker/${item.symbol}`}>
                          <span

 >
                            {item.symbol.slice(0, 2)}
                          </span>
                          <span>
                            {item.symbol}
                          </span>
                        </Link>

                        <div>{fmtCurrency(item.latestClose)}</div>
                        <div

 >
                          {item.changePct === null
                            ? "—"
                            : `${item.changePct >= 0 ? "+" : ""}${item.changePct.toFixed(2)}%`}
                        </div>

                        {showSparkline && (
                          <Sparkline
                            values={item.sparkline}
                            positive={positive}

                            delayMs={index * 50}
 />
                        )}

                        <div>
                          <button
                            type="button"
                            onClick={() => startMutate(() => removeWatchlistItem(item.id))}
                            aria-label={`Remove ${item.symbol}`}
                            title="Remove"

 >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M3 6h18" />
                              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      <div>
        <Link
          href="/watchlists/new"

 >
          <span>+</span> New watchlist
        </Link>
      </div>
    </div>
  );
}
