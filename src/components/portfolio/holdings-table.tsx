"use client";

import { useState, useTransition } from "react";
import { deleteHolding } from "@/lib/actions/holdings";
import { HoldingModal } from "@/components/portfolio/holding-modal";
import type { Holding, HoldingMetrics } from "@/lib/portfolio";

function fmtCurrency(n: number | null) {
  if (n === null) return "—";
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export function HoldingsTable({ metrics }: { metrics: HoldingMetrics[] }) {
  const [editing, setEditing] = useState<Holding | null | "new">(null);
  const [isDeleting, startDelete] = useTransition();

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm text-muted">Holdings</h2>
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="rounded-lg px-4 py-2 text-[13.5px] font-semibold text-canvas"
          style={{ background: "linear-gradient(135deg, #5EE6A6, #22B573)" }}
        >
          + Add holding
        </button>
      </div>

      {metrics.length === 0 ? (
        <div className="rounded-card border border-dashed border-line p-12 text-center text-sm text-muted">
          No holdings yet. Add your first one to start tracking performance.
        </div>
      ) : (
        <div className="overflow-hidden rounded-card border border-line bg-panel">
          <div className="grid grid-cols-[1.4fr_0.8fr_0.9fr_0.9fr_0.9fr_0.9fr_70px] border-b border-line px-5 py-3.5 text-[11.5px] tracking-[0.06em] text-muted uppercase">
            <div>Holding</div>
            <div>Qty</div>
            <div>Price</div>
            <div>Cost basis</div>
            <div>Value</div>
            <div>Gain/loss</div>
            <div />
          </div>
          {metrics.map((m) => (
            <div
              key={m.id}
              className="grid grid-cols-[1.4fr_0.8fr_0.9fr_0.9fr_0.9fr_0.9fr_70px] items-center border-b border-line px-5 py-4 last:border-b-0"
            >
              <div className="flex items-center gap-2.5">
                <div
                  className="h-[26px] w-[26px] shrink-0 rounded-full opacity-85"
                  style={{ background: "linear-gradient(135deg, #5EE6A6, #22B573)" }}
                />
                <div>
                  <div className="text-sm text-primary">{m.symbol}</div>
                  <div className="text-[11.5px] text-muted capitalize">{m.asset_type}</div>
                </div>
              </div>
              <div className="text-[13.5px] text-primary">{m.quantity}</div>
              <div className="text-[13.5px] text-primary">{fmtCurrency(m.currentPrice)}</div>
              <div className="text-[13.5px] text-muted">{fmtCurrency(m.purchase_price * m.quantity)}</div>
              <div className="text-[13.5px] text-primary">{fmtCurrency(m.value)}</div>
              <div className={`text-[13.5px] ${(m.gain ?? 0) >= 0 ? "text-accent" : "text-negative"}`}>
                {m.gain === null ? "—" : `${m.gain >= 0 ? "+" : ""}${fmtCurrency(m.gain)}`}
              </div>
              <div className="flex items-center gap-1 text-muted">
                <button
                  type="button"
                  onClick={() => setEditing(m)}
                  aria-label={`Edit ${m.symbol}`}
                  title="Edit"
                  className="rounded-lg p-1.5 transition-colors duration-fast ease-standard hover:bg-active hover:text-primary"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
                  className="rounded-lg p-1.5 text-negative transition-colors duration-fast ease-standard hover:bg-active disabled:opacity-50"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 6h18" />
                    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    <path d="M10 11v6" />
                    <path d="M14 11v6" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing !== null && (
        <HoldingModal holding={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
      )}
    </>
  );
}
