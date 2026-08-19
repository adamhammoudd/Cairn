"use client";

import { useState, useTransition, type ReactNode } from "react";
import { deleteHolding } from "@/lib/actions/holdings";
import { HoldingModal } from "@/components/portfolio/holding-modal";
import { Sparkline } from "@/components/sparkline";
import type { Holding, HoldingMetrics } from "@/lib/portfolio";

const COLS = "grid-cols-[1.5fr_0.7fr_0.9fr_1fr_1fr_1.1fr_96px_72px]";

function fmtCurrency(n: number | null) {
  if (n === null) return "—";
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export function HoldingsTable({
  metrics,
  sparklines = {},
  children,
}: {
  metrics: HoldingMetrics[];
  /** 30-day close series per symbol, for the inline trend column. */
  sparklines?: Record<string, number[]>;
  /** Slotted between the page header and the table — the mock puts the stat
      cards and value chart there, and the header owns this component's
      "Add holding" modal state, so they render through rather than around. */
  children?: ReactNode;
}) {
  const [editing, setEditing] = useState<Holding | null | "new">(null);
  const [isDeleting, startDelete] = useTransition();

  // The mock lists positions largest-first; unpriced rows sink to the bottom.
  const rows = [...metrics].sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));

  return (
    <>
      <div className="mb-5.5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 font-mono text-[10.5px] tracking-[0.16em] text-muted uppercase">Portfolio</div>
          <h1 className="font-serif text-[32px] leading-[1.1] font-normal text-primary">Holdings</h1>
        </div>
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="flex items-center gap-2 rounded-[10px] bg-gradient-to-br from-accent-light to-accent-dark px-4 py-2.5 text-[13px] font-semibold text-canvas transition-[box-shadow,transform] duration-base ease-standard hover:-translate-y-px hover:shadow-[0_0_26px_rgba(47,198,133,0.35)]"
        >
          <span className="text-[15px] leading-none">+</span> Add holding
        </button>
      </div>

      {children}

      {metrics.length === 0 ? (
        <div className="rounded-card border border-line bg-panel px-6 py-15 text-center">
          <div className="font-serif text-[20px] text-primary">No stones stacked yet</div>
          <p className="mx-auto mt-2 mb-4.5 max-w-[380px] text-[13px] text-muted text-pretty">
            Add your first holding and Cairn starts tracking value, gain/loss, and news relevance for it.
          </p>
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="rounded-lg bg-gradient-to-br from-accent-light to-accent-dark px-4.5 py-2.5 text-[13px] font-semibold text-canvas transition-[box-shadow,transform] duration-base ease-standard hover:-translate-y-px hover:shadow-[0_0_26px_rgba(47,198,133,0.35)]"
          >
            + Add holding
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-card border border-line bg-panel">
          <div className="flex items-center justify-between border-b border-line px-4.5 py-3.5">
            <span className="font-mono text-[10.5px] tracking-[0.14em] text-muted uppercase">
              {metrics.length} {metrics.length === 1 ? "position" : "positions"}
            </span>
            <span className="text-[11.5px] text-dim">Sorted by value</span>
          </div>

          {/* Phone (<640px): the mock swaps the table for stacked cards. */}
          <div className="sm:hidden">
            {rows.map((m, index) => {
              const positive = (m.gain ?? 0) >= 0;
              const series = sparklines[m.symbol] ?? [];
              return (
                <div key={m.id} className="flex flex-col gap-2.5 border-b border-[#171717] px-4 py-3.5 last:border-b-0">
                  <div className="flex items-center justify-between gap-2.5">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div
                        className="flex h-7.5 w-7.5 shrink-0 items-center justify-center rounded-lg font-mono text-[10.5px] text-canvas"
                        style={{
                          background: positive
                            ? "linear-gradient(135deg, #5EE6A6, #22B573)"
                            : "linear-gradient(135deg, #E39B9B, #C25A5A)",
                        }}
                      >
                        {m.symbol.slice(0, 2)}
                      </div>
                      <div className="min-w-0">
                        <div className="text-[14px] text-primary">{m.symbol}</div>
                        <div className="truncate text-[11.5px] text-muted capitalize">{m.asset_type}</div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setEditing(m)}
                        aria-label={`Edit ${m.symbol}`}
                        className="flex h-7.5 w-7.5 items-center justify-center rounded-lg text-muted"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        disabled={isDeleting}
                        onClick={() => {
                          if (window.confirm(`Remove ${m.symbol} from your portfolio?`)) {
                            startDelete(() => deleteHolding(m.id));
                          }
                        }}
                        aria-label={`Delete ${m.symbol}`}
                        className="flex h-7.5 w-7.5 items-center justify-center rounded-lg text-negative disabled:opacity-50"
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
                      <div className="text-[10px] text-dim">Value</div>
                      <div className="mt-0.75 text-[12.5px] tabular-nums text-primary">{fmtCurrency(m.value)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-dim">Price</div>
                      <div className="mt-0.75 text-[12.5px] tabular-nums text-primary">{fmtCurrency(m.currentPrice)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-dim">Gain / loss</div>
                      <div
                        className={`mt-0.75 text-[12.5px] tabular-nums ${positive ? "text-accent" : "text-negative"}`}
                      >
                        {m.gainPct === null ? "—" : `${m.gainPct >= 0 ? "+" : ""}${m.gainPct.toFixed(1)}%`}
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
                className={`grid ${COLS} gap-3 border-b border-[#1E1E1E] px-4.5 py-2.5 font-mono text-[9.5px] tracking-[0.12em] text-dim uppercase`}
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
                    className={`grid ${COLS} items-center gap-3 border-b border-[#171717] px-4.5 py-3.25 transition-colors duration-fast ease-standard last:border-b-0 hover:bg-active`}
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg font-mono text-[10px] font-medium text-canvas"
                        style={{
                          background: positive
                            ? "linear-gradient(135deg, #5EE6A6, #22B573)"
                            : "linear-gradient(135deg, #E39B9B, #C25A5A)",
                        }}
                      >
                        {m.symbol.slice(0, 2)}
                      </div>
                      <div className="min-w-0">
                        <div className="text-[13px] text-primary">{m.symbol}</div>
                        <div className="truncate text-[11px] text-muted capitalize">{m.asset_type}</div>
                      </div>
                    </div>

                    <div className="text-[12.5px] tabular-nums text-primary">{m.quantity}</div>
                    <div className="text-[12.5px] tabular-nums text-primary">{fmtCurrency(m.currentPrice)}</div>
                    <div className="text-[12.5px] tabular-nums text-muted">
                      {fmtCurrency(m.purchase_price * m.quantity)}
                    </div>
                    <div className="text-[12.5px] tabular-nums text-primary">{fmtCurrency(m.value)}</div>

                    <div className="flex flex-col gap-0.5">
                      <span className={`text-[12.5px] tabular-nums ${positive ? "text-accent" : "text-negative"}`}>
                        {m.gain === null ? "—" : `${positive ? "+" : ""}${fmtCurrency(m.gain)}`}
                      </span>
                      <span
                        className={`text-[11px] tabular-nums opacity-70 ${positive ? "text-accent" : "text-negative"}`}
                      >
                        {m.gainPct === null ? "" : `${m.gainPct >= 0 ? "+" : ""}${m.gainPct.toFixed(1)}%`}
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
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors duration-fast ease-standard hover:bg-active hover:text-primary"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        disabled={isDeleting}
                        onClick={() => {
                          if (window.confirm(`Remove ${m.symbol} from your portfolio?`)) {
                            startDelete(() => deleteHolding(m.id));
                          }
                        }}
                        aria-label={`Delete ${m.symbol}`}
                        title="Delete"
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-negative transition-colors duration-fast ease-standard hover:bg-negative/12 disabled:opacity-50"
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
    </>
  );
}
