"use client";

import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { deleteHolding } from "@/lib/actions/holdings";
import { HoldingModal } from "@/components/portfolio/holding-modal";
import { Sparkline } from "@/components/sparkline";
import { useDisplayPrefs } from "@/components/display-prefs-provider";
import { formatMoney, formatCompactMoney, formatChange, formatSecondaryChange } from "@/lib/display-prefs";
import { formatQuantity, type Holding, type HoldingMetrics } from "@/lib/portfolio";
import { assetTypeBadge, ASSET_TYPE_TAG_CLASS } from "@/lib/screener";
import { ConfirmDialog } from "@/components/dialog";

const COLS = "grid-cols-[1.5fr_0.7fr_0.9fr_1fr_1fr_1.1fr_96px_72px]";

export function HoldingsTable({
  metrics,
  sparklines = {},
  children,
}: {
  metrics: HoldingMetrics[];
  /** 30-day close series per symbol, for the inline trend column. */
  sparklines?: Record<string, number[]>;
  /** Slotted between the page header and the table - the mock puts the stat
      cards and value chart there, and the header owns this component's
      "Add holding" modal state, so they render through rather than around. */
  children?: ReactNode;
}) {
  const [editing, setEditing] = useState<Holding | null | "new">(null);
  const [isDeleting, startDelete] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // The row awaiting confirmation. window.confirm blocked inline and returned
  // a boolean; the dialog is declarative, so the pending target lives in state.
  const [pendingDelete, setPendingDelete] = useState<{ symbol: string; id: string } | null>(null);

  function handleDelete(symbol: string, id: string) {
    setPendingDelete({ symbol, id });
  }

  function confirmDelete() {
    const target = pendingDelete;
    setPendingDelete(null);
    if (!target) return;
    setDeleteError(null);
    startDelete(async () => {
      const error = await deleteHolding(target.id);
      if (error) setDeleteError(`Couldn't remove ${target.symbol}: ${error}`);
    });
  }
  // Currency and percent-vs-dollar both come from Settings > Display. Every
  // figure below goes through the shared formatters so a currency change
  // cannot reach the value column and miss the cost basis.
  const prefs = useDisplayPrefs();
  // Compact once a figure passes ~$1M so a large position can't stretch a
  // column; the exact value is on the cell's title. Ordinary holdings are
  // unaffected (formatCompactMoney defers to formatMoney below the threshold).
  const fmtCurrency = (n: number | null) => formatCompactMoney(n, prefs);
  const fmtExact = (n: number | null) => formatMoney(n, prefs);

  // The mock lists positions largest-first; unpriced rows sink to the bottom.
  const rows = [...metrics].sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-[18px]">
        <div>
          <div className="mb-2 font-mono text-[10.5px] tracking-[0.18em] text-muted uppercase">Portfolio</div>
          <h1 className="font-serif text-[40px] leading-[1.05] font-normal tracking-[-0.015em] text-primary">Holdings</h1>
        </div>
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="flex items-center gap-1.5 rounded-[9px] bg-accent px-4 py-[9px] text-[12.5px] font-bold text-canvas transition-[background,transform] duration-base ease-standard hover:-translate-y-px hover:bg-accent-light"
        >
          <span className="text-title leading-none">+</span> Add holding
        </button>
      </div>

      {children}

      {deleteError && (
        <p role="alert" className="mb-3.5 rounded-control border border-negative/40 bg-negative/10 px-3.5 py-2.5 text-body text-negative">
          {deleteError}
        </p>
      )}

      {metrics.length === 0 ? (
        <div className="rounded-card border border-line bg-panel px-6 py-15 text-center">
          <div className="font-serif text-h3 text-primary">No stones stacked yet</div>
          <p className="mx-auto mt-2 mb-4.5 max-w-[380px] text-body text-muted text-pretty">
            Add your first holding and Cairn starts tracking value, gain/loss, and news relevance for it.
          </p>
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="rounded-control bg-gradient-to-br from-accent-light to-accent-dark px-4.5 py-2.5 text-body font-semibold text-canvas transition-[box-shadow,transform] duration-base ease-standard hover:-translate-y-px hover:shadow-[0_0_26px_rgba(47,198,133,0.35)]"
          >
            + Add holding
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[#232323] bg-panel">
          <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-[#1c1c1c] bg-[#0c0c0c] px-5 py-3.5">
            <span className="font-mono text-eyebrow tracking-[0.16em] text-primary uppercase">
              {metrics.length} {metrics.length === 1 ? "position" : "positions"}
            </span>
            <span className="text-caption text-dim">Sorted by value</span>
          </div>

          {/* Phone (<640px): the mock swaps the table for stacked cards. */}
          <div className="sm:hidden">
            {rows.map((m, index) => {
              const positive = (m.gain ?? 0) >= 0;
              const series = sparklines[m.symbol] ?? [];
              return (
                <div key={m.id} className="cn-row flex flex-col gap-2.5 border-b border-[#171717] px-4 py-3.5 last:border-b-0">
                  <div className="flex items-center justify-between gap-2.5">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div
                        className="flex h-7.5 w-7.5 shrink-0 items-center justify-center rounded-control font-mono text-micro text-canvas"
                        style={{
                          background: positive
                            ? "var(--gradient-gain)"
                            : "var(--gradient-loss)",
                        }}
                      >
                        {m.symbol.slice(0, 2)}
                      </div>
                      <div className="min-w-0">
                        <Link
                          href={`/ticker/${encodeURIComponent(m.symbol)}`}
                          className="text-lead text-primary hover:text-accent"
                        >
                          {m.symbol}
                        </Link>
                        <div className="truncate text-caption text-muted">{assetTypeBadge(m.asset_type)}</div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setEditing(m)}
                        aria-label={`Edit ${m.symbol}`}
                        className="flex h-7.5 w-7.5 items-center justify-center rounded-control text-muted"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        disabled={isDeleting}
                        onClick={() => handleDelete(m.symbol, m.id)}
                        aria-label={`Delete ${m.symbol}`}
                        className="flex h-7.5 w-7.5 items-center justify-center rounded-control text-negative disabled:opacity-50"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 6h18" />
                          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  <Sparkline values={series} positive={positive} delayMs={index * 60} className="h-8.5 w-full" />

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <div className="text-eyebrow text-dim">Value</div>
                      <div className="mt-1 text-body tabular-nums text-primary">{fmtCurrency(m.value)}</div>
                    </div>
                    <div>
                      <div className="text-eyebrow text-dim">Price</div>
                      <div
                        className="mt-1 flex items-center gap-1 text-body tabular-nums text-primary"
                        title={m.priceStale ? `Stale - last updated ${m.priceAsOf ?? "unknown"}` : undefined}
                      >
                        {fmtCurrency(m.currentPrice)}
                        {m.priceStale && (
                          <span aria-label={`Price stale as of ${m.priceAsOf ?? "unknown date"}`} className="text-negative">
                            ⚠
                          </span>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-eyebrow text-dim">Gain / loss</div>
                      <div
                        className={`mt-1 text-body tabular-nums ${positive ? "text-accent" : "text-negative"}`}
                      >
                        {formatChange(m.gain, m.gainPct, prefs, 1)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="hidden overflow-x-auto sm:block">
            <div className="min-w-[860px]">
              <div
                className={`grid ${COLS} gap-3 border-b border-[#1c1c1c] bg-[#0c0c0c] px-5 py-2.5 font-mono text-eyebrow tracking-[0.14em] text-dim uppercase`}
              >
                <div>Holding</div>
                <div>Qty</div>
                <div>Price</div>
                <div>Cost basis</div>
                <div>Value</div>
                <div>Gain / loss</div>
                <div>30d</div>
                <div />
              </div>

              {rows.map((m, index) => {
                const positive = (m.gain ?? 0) >= 0;
                const series = sparklines[m.symbol] ?? [];
                return (
                  <div
                    key={m.id}
                    className={`cn-row grid ${COLS} items-center gap-3 border-b border-[#171717] px-5 py-[13px] transition-colors duration-fast ease-standard last:border-b-0 hover:bg-raised`}
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div
                        className={`flex h-7.5 w-7.5 shrink-0 items-center justify-center rounded-[9px] border bg-panel font-mono text-[10.5px] ${
                          ASSET_TYPE_TAG_CLASS[m.asset_type] ?? "text-muted border-line"
                        }`}
                      >
                        {m.symbol.slice(0, 2)}
                      </div>
                      <div className="min-w-0">
                        <Link
                          href={`/ticker/${encodeURIComponent(m.symbol)}`}
                          className="text-[13.5px] font-semibold text-primary hover:text-accent"
                        >
                          {m.symbol}
                        </Link>
                        <div className="truncate text-micro text-dim">{assetTypeBadge(m.asset_type)}</div>
                      </div>
                    </div>

                    <div className="font-mono text-[12.5px] tabular-nums text-muted" title={m.quantity.toLocaleString()}>
                      {formatQuantity(m.quantity)}
                    </div>
                    <div
                      className="flex items-center gap-1 font-mono text-[12.5px] tabular-nums text-primary"
                      title={m.priceStale ? `Stale - last updated ${m.priceAsOf ?? "unknown"}` : undefined}
                    >
                      {fmtCurrency(m.currentPrice)}
                      {m.priceStale && (
                        <span aria-label={`Price stale as of ${m.priceAsOf ?? "unknown date"}`} className="text-negative">
                          ⚠
                        </span>
                      )}
                    </div>
                    <div
                      className="font-mono text-[12.5px] tabular-nums text-muted"
                      title={fmtExact(m.purchase_price * m.quantity)}
                    >
                      {fmtCurrency(m.purchase_price * m.quantity)}
                    </div>
                    <div className="font-mono text-[12.5px] tabular-nums text-primary" title={fmtExact(m.value)}>
                      {fmtCurrency(m.value)}
                    </div>

                    {/* Which unit leads is Settings > Display > "Show percent
                        vs. dollar change". Both are still shown - the setting
                        reorders them rather than hiding one, so nothing a
                        reader could want is taken away by a display choice. */}
                    <div className="flex flex-col gap-0.5">
                      <span className={`font-mono text-[12.5px] tabular-nums ${positive ? "text-accent" : "text-negative"}`}>
                        {formatChange(m.gain, m.gainPct, prefs, 1)}
                      </span>
                      <span
                        className={`font-mono text-micro tabular-nums opacity-75 ${positive ? "text-accent" : "text-negative"}`}
                      >
                        {m.gain === null && m.gainPct === null ? "" : formatSecondaryChange(m.gain, m.gainPct, prefs, 1)}
                      </span>
                    </div>

                    <div>
                      <Sparkline values={series} positive={positive} delayMs={index * 60} />
                    </div>

                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => setEditing(m)}
                        aria-label={`Edit ${m.symbol}`}
                        title="Edit"
                        className="flex h-7 w-7 items-center justify-center rounded-control text-muted transition-colors duration-fast ease-standard hover:bg-active hover:text-primary"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        disabled={isDeleting}
                        onClick={() => handleDelete(m.symbol, m.id)}
                        aria-label={`Delete ${m.symbol}`}
                        title="Delete"
                        className="flex h-7 w-7 items-center justify-center rounded-control text-negative transition-colors duration-fast ease-standard hover:bg-negative/12 disabled:opacity-50"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 6h18" />
                          <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                          <path d="M10 11v6" />
                          <path d="M14 11v6" />
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

      {editing !== null && (
        <HoldingModal holding={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Remove ${pendingDelete?.symbol ?? ""} from your portfolio?`}
        description="The position and its cost basis are deleted. Your recorded history for this symbol goes with it."
        confirmLabel="Remove position"
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}
