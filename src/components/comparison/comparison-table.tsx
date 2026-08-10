"use client";

import Link from "next/link";
import { formatMarketCap } from "@/lib/screener";
import type { ComparisonRow } from "@/lib/comparison";

function fmtCurrency(n: number | null) {
  if (n === null) return "—";
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export function ComparisonTable({ rows }: { rows: ComparisonRow[] }) {
  return (
    <div className="overflow-hidden rounded-card border border-line bg-panel">
      <div className="grid grid-cols-[1fr_0.8fr_0.8fr_0.9fr_0.6fr_0.9fr_0.9fr] border-b border-line px-5 py-3.5 text-[11.5px] tracking-[0.06em] text-muted uppercase">
        <div>Symbol</div>
        <div>Price</div>
        <div>Change</div>
        <div>Market cap</div>
        <div>P/E</div>
        <div>Div. yield</div>
        <div>Volume</div>
      </div>
      {rows.map((row) => (
        <div
          key={row.symbol}
          className="grid grid-cols-[1fr_0.8fr_0.8fr_0.9fr_0.6fr_0.9fr_0.9fr] items-center border-b border-line px-5 py-3.5 last:border-b-0"
        >
          <Link href={`/ticker/${row.symbol}`} className="text-sm text-primary hover:text-accent">
            {row.symbol}
          </Link>
          <div className="text-[13.5px] text-primary">{fmtCurrency(row.price)}</div>
          <div className={`text-[13px] ${row.changePct === null ? "text-muted" : row.changePct >= 0 ? "text-accent" : "text-negative"}`}>
            {row.changePct === null ? "—" : `${row.changePct >= 0 ? "+" : ""}${row.changePct.toFixed(2)}%`}
          </div>
          <div className="text-[13px] text-primary">{formatMarketCap(row.marketCap)}</div>
          <div className="text-[13px] text-primary">{row.pe === null ? "—" : row.pe.toFixed(1)}</div>
          <div className="text-[13px] text-primary">{row.dividendYield === null ? "—" : `${row.dividendYield.toFixed(2)}%`}</div>
          <div className="text-[13px] text-primary">{row.volume === null ? "—" : row.volume.toLocaleString()}</div>
        </div>
      ))}
    </div>
  );
}
