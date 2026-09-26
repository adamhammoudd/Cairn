"use client";

import { useState } from "react";
import { getOptionsChain } from "@/lib/actions/reference";
import { useLazyPanel } from "@/components/ticker/use-lazy-panel";
import type { OptionRow } from "@/lib/actions/reference";
import { ScrollX } from "@/components/scroll-x";

// Quoted contract data as the provider returns it. Cairn computes no Greeks:
// delta/gamma/theta need a pricing model plus a risk-free rate and a dividend
// assumption, and printing modelled values beside quoted ones without saying
// which is which is exactly the kind of unsourced number this product forbids.

const num = (v: number | null, digits = 2) => (v === null ? "-" : v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits }));
const int = (v: number | null) => (v === null ? "-" : v.toLocaleString());
const pct = (v: number | null) => (v === null ? "-" : `${(v * 100).toFixed(1)}%`);

function ChainTable({ rows, title, spot }: { rows: OptionRow[]; title: string; spot: number | null }) {
  return (
    <div className="overflow-hidden rounded-card border border-line bg-panel">
      <div className="border-b border-line px-4 py-3 font-mono text-eyebrow text-muted uppercase">
        {title} · {rows.length}
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-body text-muted">No {title.toLowerCase()} quoted for this expiry.</p>
      ) : (
        <ScrollX label={`${title} options chain`} hintClassName="sm:hidden" className="max-h-[460px] overflow-y-auto">
          <table className="w-full min-w-[520px] border-collapse text-caption">
            <thead className="sticky top-0 bg-panel">
              <tr className="border-b border-line">
                {["Strike", "Last", "Bid", "Ask", "Vol", "OI", "IV"].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-right font-mono text-eyebrow text-dim uppercase first:text-left">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.strike}
                  className={`border-b border-line-soft last:border-b-0 hover:bg-active ${r.in_the_money ? "bg-panel" : ""}`}
                >
                  <td className="px-3 py-2 text-left tabular-nums text-primary">
                    {num(r.strike)}
                    {spot !== null && Math.abs(r.strike - spot) < 1e-9 && (
                      <span className="ml-1.5 font-mono text-eyebrow text-dim">ATM</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-primary">{num(r.last_price)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted">{num(r.bid)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted">{num(r.ask)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted">{int(r.volume)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted">{int(r.open_interest)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted">{pct(r.implied_volatility)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollX>
      )}
    </div>
  );
}

export function OptionsPanel({ symbol, spot }: { symbol: string; spot: number | null }) {
  const [expiry, setExpiry] = useState<string | undefined>(undefined);
  const { data: chain, loading } = useLazyPanel(`${symbol}|${expiry ?? ""}`, () => getOptionsChain(symbol, expiry));

  if (loading && !chain) {
    return <div className="rounded-card border border-line bg-panel p-10 text-center text-lead text-muted">Checking for listed options on {symbol}…</div>;
  }

  if (!chain || chain.expiries.length === 0) {
    return (
      <div className="mx-auto max-w-[54ch] rounded-card border border-line bg-panel p-10 text-center text-body text-muted text-pretty">
        {chain?.detail ?? `No listed options for ${symbol}.`}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 rounded-panel border border-line p-1">
          {chain.expiries.slice(0, 8).map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setExpiry(e)}
              className={`rounded-control px-3 py-1.5 font-mono text-micro transition-colors duration-base ease-standard ${
                chain.expiry === e ? "bg-active text-primary" : "text-muted hover:text-primary"
              }`}
            >
              {e}
            </button>
          ))}
        </div>
        <span className="font-mono text-eyebrow text-dim uppercase">
          {chain.asOf ? `Quoted ${new Date(chain.asOf).toLocaleString()}` : "Quote time not reported"}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3.5 min-[1000px]:grid-cols-2">
        <ChainTable rows={chain.calls} title="Calls" spot={spot} />
        <ChainTable rows={chain.puts} title="Puts" spot={spot} />
      </div>

      <p className="text-caption text-dim text-pretty">
        Bid, ask, last, volume, open interest and implied volatility are as quoted by the market-data provider. Cairn
        does not compute Greeks - those require a pricing model and rate assumptions, and a modelled figure shown
        beside quoted ones would be indistinguishable from market data.
      </p>
    </div>
  );
}
