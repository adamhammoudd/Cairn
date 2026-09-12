"use client";

import Link from "next/link";
import { SymbolTypeahead } from "@/components/symbol-typeahead";
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
import { DataFreshness } from "@/components/data-freshness";
import { useDisplayPrefs } from "@/components/display-prefs-provider";
import { absoluteChangeFrom, formatChange, formatMoney } from "@/lib/display-prefs";
import { ConfirmDialog } from "@/components/dialog";

export function WatchlistPanel({ watchlists }: { watchlists: WatchlistWithItems[] }) {
  // Settings > Display drives the currency on the price column and the unit on
  // the 24h column, the same as Markets and Holdings.
  const prefs = useDisplayPrefs();
  const fmtCurrency = (n: number | null) => formatMoney(n, prefs);
  const [activeId, setActiveId] = useState(watchlists[0]?.id ?? null);
  const [addError, addAction] = useActionState(addWatchlistItem, null);
  const [, startMutate] = useTransition();
  const [dragId, setDragId] = useState<string | null>(null);
  const [confirmingDeleteList, setConfirmingDeleteList] = useState(false);

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

  // Newest bar behind any row in this list.
  const listAsOf = sortedItems.reduce<string | null>((newest, i) => (i.asOf && (!newest || i.asOf > newest) ? i.asOf : newest), null);

  const manualSort = active?.displayPrefs.sortBy === "manual";
  const showSparkline = active?.displayPrefs.showSparkline ?? false;
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

  // Breadth across the active list: how many of its symbols are up today.
  // The design puts this beside the list name, because "is this basket
  // working" is the question a watchlist is opened with.
  const greens = active ? active.items.filter((i) => (i.changePct ?? 0) >= 0).length : 0;
  const listSize = active?.items.length ?? 0;
  const mostlyUp = listSize > 0 && greens >= listSize / 2;

  return (
    <div
      className="animate-page-in flex flex-col gap-3.5"
      style={{
        backgroundImage:
          "radial-gradient(880px 420px at 8% -8%, rgba(155,140,224,.10), transparent 70%), radial-gradient(720px 380px at 96% 0%, rgba(47,198,133,.07), transparent 72%)",
      }}
    >
      <div className="flex flex-wrap items-end justify-between gap-[18px]">
        <div className="min-w-0">
          <div className="mb-2 font-mono text-[10.5px] tracking-[0.18em] text-muted uppercase">
            Portfolio · Watchlists
          </div>
          <h1 className="font-serif text-[40px] leading-[1.05] font-normal tracking-[-0.015em] text-primary">
            {active?.name ?? "Watchlists"}
          </h1>
          {active?.description ? (
            <p className="mt-2 max-w-[520px] text-[13.5px] leading-[1.55] text-muted text-pretty">
              {active.description}
            </p>
          ) : (
            <p className="mt-2 max-w-[520px] text-[13.5px] leading-[1.55] text-muted text-pretty">
              Names you don&apos;t own yet. Group them however you think, and Cairn tells you when one crosses a level
              you care about.
            </p>
          )}
        </div>
        {active && (
          <span
            className={`rounded-full border px-3 py-[7px] font-mono text-micro ${
              listSize === 0
                ? "border-line text-dim"
                : mostlyUp
                  ? "border-accent/35 bg-accent/10 text-accent-light"
                  : "border-negative/35 bg-negative/10 text-negative-light"
            }`}
          >
            {listSize === 0 ? "No symbols yet" : `${greens} up · ${listSize - greens} down`}
          </span>
        )}
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
                className={`flex items-center gap-2.5 rounded-[10px] border px-3.5 py-2.5 transition-colors duration-base ease-standard hover:border-line-strong ${
                  isActive ? "border-line-strong bg-[#181818]" : "border-[#232323] bg-transparent"
                }`}
              >
                <span
                  className={`h-2 w-2 shrink-0 rounded-xs ${tintForWatchlist(w.id)} ${isActive ? "" : "opacity-55"}`}
                />
                <span className={`text-[12.5px] ${isActive ? "text-primary" : "text-muted"}`}>{w.name}</span>
                <span
                  className={`rounded-[5px] px-1.5 py-px font-mono text-eyebrow ${
                    isActive ? "bg-active text-primary" : "bg-[#161616] text-dim"
                  }`}
                >
                  {w.items.length}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {!active ? (
        // The action belongs inside the empty state. It was rendered
        // unconditionally at the foot of the panel, so an empty account got a
        // large dashed box explaining watchlists and then a button floating
        // on its own below it, reading as an orphan rather than the obvious
        // next step.
        <div className="rounded-card border border-dashed border-line px-6 py-16 text-center">
          <div className="font-serif text-h3 text-primary">No lists marked out yet</div>
          <p className="mx-auto mt-2 max-w-[400px] text-body text-muted text-pretty">
            Group the tickers you&apos;re tracking but don&apos;t own yet, and Cairn keeps their prices and trends
            beside your portfolio.
          </p>
          <Link
            href="/watchlists/new"
            className="mt-6 inline-flex items-center gap-2 rounded-panel bg-gradient-to-br from-accent-light to-accent-dark px-5.5 py-3 text-body font-semibold text-canvas transition-[box-shadow,transform] duration-base ease-standard hover:-translate-y-px hover:shadow-[0_0_30px_rgba(47,198,133,0.35)]"
          >
            <span className="text-title leading-none">+</span> New watchlist
          </Link>
        </div>
      ) : (
        <>
          <form action={addAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="watchlist_id" value={active.id} />
            {/* Was a plain text input that accepted any string: a beta tester
                typed "ZZQQ9!!" and it was stored, rendering a permanent dead
                row of "- - -". SymbolTypeahead is selection-only - the
                submitted value can only ever come from picking a real
                market-data row - and it is the same picker Add Holding,
                Alerts and Compare use, so this is no longer a second search
                experience for the same task. */}
            <SymbolTypeahead
              name="symbol"
              required
              clearOnSelect
              // The hidden `symbol` field carries the pick into the form
              // action; nothing extra is needed on selection here.
              onSelect={() => {}}
              placeholder="Add symbol (e.g. NVDA)"
              exclude={active.items.map((i) => i.symbol)}
              className="w-52"
              inputClassName="w-full rounded-control border border-line bg-transparent px-3 py-2 text-body text-primary uppercase outline-none transition-colors duration-base ease-standard hover:border-line-strong focus:border-line-strong"
            />
            <button
              type="submit"
              className="rounded-control border border-line px-3.5 py-2 text-body text-primary transition-colors duration-base ease-standard hover:border-line-strong hover:bg-active"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDeleteList(true)}
              className="ml-auto text-body text-muted transition-colors duration-fast ease-standard hover:text-negative"
            >
              Delete list
            </button>
          </form>
          {addError && addError !== "saved" && <p className="text-body text-negative">{addError}</p>}

          {sortedItems.length === 0 ? (
            <div className="rounded-card border border-dashed border-line px-6 py-16 text-center">
              <div className="font-serif text-h3 text-primary">Nothing on this list yet</div>
              <p className="mx-auto mt-2 max-w-[380px] text-body text-muted text-pretty">
                Add a symbol above to start tracking its price and 30-day trend.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3.5">
              {/* The same stored closes Markets and the ticker page show, so
                  the same freshness statement rather than none at all. */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#232323] bg-panel px-[22px] py-4">
                <span className="font-mono text-eyebrow tracking-[0.16em] text-primary uppercase">
                  {sortedItems.length} {sortedItems.length === 1 ? "symbol" : "symbols"}
                </span>
                <DataFreshness source="last_close" asOf={listAsOf} />
              </div>
              <div>
                <div className="grid grid-cols-[repeat(auto-fit,minmax(252px,1fr))] gap-3">

                  {sortedItems.map((item, index) => {
                    const positive = (item.changePct ?? 0) >= 0;
                    return (
                      <div
                        key={item.id}
                        draggable={manualSort}
                        onDragStart={() => setDragId(item.id)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => handleDrop(item.id)}
                        className={`cn-row animate-rise-in flex flex-col gap-2.5 rounded-[14px] border border-[#232323] bg-panel px-4 py-[15px] transition-[transform,border-color,background] duration-[220ms] ease-standard hover:-translate-y-[3px] hover:border-line-strong hover:bg-[#131313] ${
                          dragId === item.id ? "opacity-50" : ""
                        }`}
                        style={{ animationDelay: `${120 + index * 50}ms` }}
                      >
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`shrink-0 text-lead text-dim select-none ${
                              manualSort ? "cursor-grab" : "hidden"
                            }`}
                            aria-hidden
                          >
                            ⠿
                          </span>
                          <Link href={`/ticker/${item.symbol}`} className="flex min-w-0 items-center gap-2.5">
                            <span
                              className={`flex h-7.5 w-7.5 shrink-0 items-center justify-center rounded-[9px] border bg-panel font-mono text-[10.5px] ${tintForWatchlist(
                                active.id,
                              ).replace("bg-", "text-")} border-line`}
                            >
                              {item.symbol.slice(0, 2)}
                            </span>
                            <span className="truncate text-[13.5px] font-semibold text-primary transition-colors duration-fast ease-standard hover:text-accent">
                              {item.symbol}
                            </span>
                          </Link>
                          <span className="flex-1" />
                          <span
                            className={`shrink-0 font-mono text-caption tabular-nums ${
                              item.changePct === null ? "text-muted" : positive ? "text-accent" : "text-negative"
                            }`}
                          >
                            {formatChange(
                              absoluteChangeFrom(item.latestClose, item.changePct),
                              item.changePct,
                              prefs,
                            )}
                          </span>
                        </div>

                        {showSparkline && (
                          <Sparkline
                            values={item.sparkline}
                            positive={positive}
                            className="h-10 w-full"
                            delayMs={140 + index * 60}
                          />
                        )}

                        <div className="flex items-center justify-between gap-2 font-mono text-[11.5px]">
                          <span className="tabular-nums text-primary">{fmtCurrency(item.latestClose)}</span>
                          <button
                            type="button"
                            onClick={() => startMutate(() => removeWatchlistItem(item.id))}
                            aria-label={`Remove ${item.symbol}`}
                            title="Remove"
                            className="flex h-6 w-6 items-center justify-center rounded-control text-negative transition-colors duration-fast ease-standard hover:bg-negative/12"
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

      {active && (
        <div className="mt-1 flex justify-center">
          <Link
            href="/watchlists/new"
            className="flex items-center gap-2 rounded-panel bg-gradient-to-br from-accent-light to-accent-dark px-5.5 py-3 text-body font-semibold text-canvas transition-[box-shadow,transform] duration-base ease-standard hover:-translate-y-px hover:shadow-[0_0_30px_rgba(47,198,133,0.35)]"
          >
            <span className="text-title leading-none">+</span> New watchlist
          </Link>
        </div>
      )}

      <ConfirmDialog
        open={confirmingDeleteList}
        title={`Delete the "${active?.name ?? ""}" list?`}
        description="The list and every symbol in it are removed. Alerts you set on those symbols are not affected."
        confirmLabel="Delete list"
        destructive
        onConfirm={() => {
          setConfirmingDeleteList(false);
          if (active) startMutate(() => deleteWatchlist(active.id));
        }}
        onCancel={() => setConfirmingDeleteList(false)}
      />
    </div>
  );
}
