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
    <div className="animate-page-in flex flex-col gap-4">
      <div>
        <div className="mb-2 font-mono text-[10.5px] tracking-[0.16em] text-muted uppercase">Watchlists</div>
        <h1 className="font-serif text-[32px] leading-tight font-normal text-primary">
          {active?.name ?? "Watchlists"}
        </h1>
        {active?.description && <p className="mt-1.5 text-[13.5px] text-muted text-pretty">{active.description}</p>}
      </div>

      {watchlists.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {watchlists.map((w) => {
            const isActive = active?.id === w.id;
            return (
              <button
                key={w.id}
                type="button"
                onClick={() => setActiveId(w.id)}
                className={`flex items-center gap-2.25 rounded-xl border px-3.5 py-2.25 transition-colors duration-base ease-standard hover:border-[#3A3A3A] ${
                  isActive ? "border-[#3A3A3A] bg-active" : "border-line bg-transparent"
                }`}
              >
                <span className={`h-3.5 w-1.25 shrink-0 rounded-sm ${tintForWatchlist(w.id)}`} />
                <span className={`text-[13px] ${isActive ? "text-primary" : "text-muted"}`}>{w.name}</span>
                <span className="font-mono text-[10px] text-dim">{w.items.length}</span>
              </button>
            );
          })}
        </div>
      )}

      {!active ? (
        <div className="rounded-card border border-dashed border-line px-6 py-16 text-center">
          <div className="font-serif text-[21px] text-primary">No lists marked out yet</div>
          <p className="mx-auto mt-2 max-w-[400px] text-[13px] text-muted text-pretty">
            Group the tickers you&apos;re tracking but don&apos;t own yet, and Cairn keeps their prices and trends
            beside your portfolio.
          </p>
        </div>
      ) : (
        <>
          <form action={addAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="watchlist_id" value={active.id} />
            <input
              name="symbol"
              placeholder="Add symbol (e.g. NVDA)"
              className="w-52 rounded-lg border border-line bg-transparent px-3 py-2 text-[13px] text-primary uppercase outline-none transition-colors duration-base ease-standard hover:border-[#3A3A3A] focus:border-[#3A3A3A]"
            />
            <button
              type="submit"
              className="rounded-lg border border-line px-3.5 py-2 text-[13px] text-primary transition-colors duration-base ease-standard hover:border-[#3A3A3A] hover:bg-active"
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
              className="ml-auto text-[12.5px] text-muted transition-colors duration-fast ease-standard hover:text-negative"
            >
              Delete list
            </button>
          </form>
          {addError && addError !== "saved" && <p className="text-[13px] text-negative">{addError}</p>}

          {sortedItems.length === 0 ? (
            <div className="rounded-card border border-dashed border-line px-6 py-16 text-center">
              <div className="font-serif text-[20px] text-primary">Nothing on this list yet</div>
              <p className="mx-auto mt-2 max-w-[380px] text-[13px] text-muted text-pretty">
                Add a symbol above to start tracking its price and 30-day trend.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-card border border-line bg-panel">
              <div className="overflow-x-auto">
                <div className="min-w-[640px]">
                  <div
                    className={`grid ${cols} gap-3 border-b border-line px-4.5 py-2.75 font-mono text-[9.5px] tracking-[0.12em] text-dim uppercase`}
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
                        className={`animate-rise-in grid ${cols} items-center gap-3 border-b border-line px-4.5 py-3.25 transition-colors duration-fast ease-standard last:border-b-0 hover:bg-active ${
                          dragId === item.id ? "opacity-50" : ""
                        }`}
                        style={{ animationDelay: `${index * 50}ms` }}
                      >
                        <div
                          className={`text-[14px] text-muted select-none ${manualSort ? "cursor-grab" : "opacity-30"}`}
                        >
                          ⠿
                        </div>

                        <Link href={`/ticker/${item.symbol}`} className="flex min-w-0 items-center gap-2.5">
                          <span
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg font-mono text-[10px] text-canvas"
                            style={{
                              background: positive
                                ? "linear-gradient(135deg, #5EE6A6, #22B573)"
                                : "linear-gradient(135deg, #E39B9B, #C25A5A)",
                            }}
                          >
                            {item.symbol.slice(0, 2)}
                          </span>
                          <span className="truncate text-[13px] text-primary transition-colors duration-fast ease-standard hover:text-accent">
                            {item.symbol}
                          </span>
                        </Link>

                        <div className="text-[12.5px] tabular-nums text-primary">{fmtCurrency(item.latestClose)}</div>
                        <div
                          className={`text-[12.5px] tabular-nums ${
                            item.changePct === null ? "text-muted" : positive ? "text-accent" : "text-negative"
                          }`}
                        >
                          {item.changePct === null
                            ? "—"
                            : `${item.changePct >= 0 ? "+" : ""}${item.changePct.toFixed(2)}%`}
                        </div>

                        {showSparkline && (
                          <Sparkline
                            values={item.sparkline}
                            positive={positive}
                            className="h-6.5 w-[94px]"
                            delayMs={index * 50}
                          />
                        )}

                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => startMutate(() => removeWatchlistItem(item.id))}
                            aria-label={`Remove ${item.symbol}`}
                            title="Remove"
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-negative transition-colors duration-fast ease-standard hover:bg-negative/12"
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

      <div className="mt-1 flex justify-center">
        <Link
          href="/watchlists/new"
          className="flex items-center gap-2.25 rounded-xl bg-gradient-to-br from-accent-light to-accent-dark px-5.5 py-3 text-[13px] font-semibold text-canvas transition-[box-shadow,transform] duration-base ease-standard hover:-translate-y-px hover:shadow-[0_0_30px_rgba(47,198,133,0.35)]"
        >
          <span className="text-[16px] leading-none">+</span> New watchlist
        </Link>
      </div>
    </div>
  );
}
