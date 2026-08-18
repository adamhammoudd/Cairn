"use client";

import { useState, useTransition } from "react";
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
}: {
  metrics: HoldingMetrics[];
  /** 30-day close series per symbol, for the inline trend column. */
  sparklines?: Record<string, number[]>;
}) {
  const [editing, setEditing] = useState<Holding | null | "new">(null);
  const [isDeleting, startDelete] = useTransition();

  return (
    <>
      <div>
        <div>
          <div>Portfolio</div>
          <h2>Holdings</h2>
        </div>
        <button
          type="button"
          onClick={() => setEditing("new")}

 >
          <span>+</span> Add holding
        </button>
      </div>

      {metrics.length === 0 ? (
        <div>
          <div>No stones stacked yet</div>
          <p>
            Add your first holding and Cairn starts tracking value, gain/loss, and news relevance for it.
          </p>
          <button
            type="button"
            onClick={() => setEditing("new")}

 >
            + Add holding
          </button>
        </div>
      ) : (
        <div>
          <div>
            <span>
              {metrics.length} {metrics.length === 1 ? "position" : "positions"}
            </span>
            <span>Sorted by entry date</span>
          </div>

          <div>
            <div>
              <div

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

              {metrics.map((m, index) => {
                const positive = (m.gain ?? 0) >= 0;
                const series = sparklines[m.symbol] ?? [];
                return (
                  <div
                    key={m.id}

 >
                    <div>
                      <div

 >
                        {m.symbol.slice(0, 2)}
                      </div>
                      <div>
                        <div>{m.symbol}</div>
                        <div>{m.asset_type}</div>
                      </div>
                    </div>

                    <div>{m.quantity}</div>
                    <div>{fmtCurrency(m.currentPrice)}</div>
                    <div>
                      {fmtCurrency(m.purchase_price * m.quantity)}
                    </div>
                    <div>{fmtCurrency(m.value)}</div>

                    <div>
                      <span>
                        {m.gain === null ? "—" : `${positive ? "+" : ""}${fmtCurrency(m.gain)}`}
                      </span>
                      <span

 >
                        {m.gainPct === null ? "" : `${m.gainPct >= 0 ? "+" : ""}${m.gainPct.toFixed(1)}%`}
                      </span>
                    </div>

                    <div>
                      <Sparkline values={series} positive={positive} delayMs={index * 60} />
                    </div>

                    <div>
                      <button
                        type="button"
                        onClick={() => setEditing(m)}
                        aria-label={`Edit ${m.symbol}`}
                        title="Edit"

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
