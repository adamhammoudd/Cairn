"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import {
  addWatchlistItem,
  createWatchlist,
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
  const [createError, createAction] = useActionState(createWatchlist, null);
  const [addError, addAction] = useActionState(addWatchlistItem, null);
  const [, startMutate] = useTransition();
  const [dragId, setDragId] = useState<string | null>(null);

  const active = watchlists.find((w) => w.id === activeId) ?? watchlists[0] ?? null;

  function handleDrop(targetId: string) {
    if (!active || !dragId || dragId === targetId) return;
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
            className={`rounded-lg px-4 py-2 text-[13.5px] ${
              active?.id === w.id ? "bg-active text-primary" : "text-muted hover:text-primary"
            }`}
          >
            {w.name}
          </button>
        ))}

        <form action={createAction} className="ml-auto flex items-center gap-2">
          <input
            name="name"
            placeholder="New list name"
            className="w-40 rounded-lg border border-line bg-active px-3 py-2 text-[13px] text-primary outline-none"
          />
          <button
            type="submit"
            className="rounded-lg px-3.5 py-2 text-[13px] font-semibold text-canvas"
            style={{ background: "linear-gradient(135deg, #5EE6A6, #22B573)" }}
          >
            + New list
          </button>
        </form>
      </div>
      {createError && createError !== "saved" && <p className="text-[13px] text-negative">{createError}</p>}

      {!active ? (
        <div className="rounded-card border border-dashed border-line p-12 text-center text-sm text-muted">
          No watchlists yet. Create one above to start tracking symbols.
        </div>
      ) : (
        <>
          <form action={addAction} className="flex items-center gap-2">
            <input type="hidden" name="watchlist_id" value={active.id} />
            <input
              name="symbol"
              placeholder="Add symbol (e.g. NVDA)"
              className="w-52 rounded-lg border border-line bg-active px-3 py-2 text-[13px] text-primary uppercase outline-none"
            />
            <button type="submit" className="rounded-lg border border-line px-3.5 py-2 text-[13px] text-primary">
              Add
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Delete the "${active.name}" list?`)) {
                  startMutate(() => deleteWatchlist(active.id));
                }
              }}
              className="ml-auto text-[12.5px] text-muted hover:text-negative"
            >
              Delete list
            </button>
          </form>
          {addError && addError !== "saved" && <p className="text-[13px] text-negative">{addError}</p>}

          {active.items.length === 0 ? (
            <div className="rounded-card border border-dashed border-line p-12 text-center text-sm text-muted">
              No symbols in this list yet.
            </div>
          ) : (
            <div className="overflow-hidden rounded-card border border-line bg-panel">
              <div className="grid grid-cols-[24px_1.4fr_0.9fr_0.8fr_110px_60px] border-b border-line px-5 py-3.5 text-[11.5px] tracking-[0.06em] text-muted uppercase">
                <div />
                <div>Symbol</div>
                <div>Price</div>
                <div>Change</div>
                <div>Trend (30d)</div>
                <div />
              </div>
              {active.items.map((item) => (
                <div
                  key={item.id}
                  draggable
                  onDragStart={() => setDragId(item.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDrop(item.id)}
                  className={`grid grid-cols-[24px_1.4fr_0.9fr_0.8fr_110px_60px] items-center border-b border-line px-5 py-3.5 last:border-b-0 ${
                    dragId === item.id ? "opacity-50" : ""
                  }`}
                >
                  <div className="cursor-grab text-[14px] text-muted select-none">⠿</div>
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
                  <Sparkline values={item.sparkline} positive={(item.changePct ?? 0) >= 0} />
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
          )}
        </>
      )}
    </div>
  );
}
