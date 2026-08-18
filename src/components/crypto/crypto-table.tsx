import Link from "next/link";
import { formatMarketCap } from "@/lib/screener";
import { formatSupply, type CryptoRow } from "@/lib/crypto";

export function CryptoTable({ rows }: { rows: CryptoRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-line p-12 text-center text-sm text-muted">
        No crypto data yet — ingestion may not have run.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-card border border-line bg-panel">
      <div className="grid grid-cols-[40px_1.4fr_0.9fr_0.7fr_1fr_1fr_1fr] border-b border-line px-5 py-3.5 text-[11.5px] tracking-[0.06em] text-muted uppercase">
        <div>#</div>
        <div>Name</div>
        <div>Price</div>
        <div>24h</div>
        <div>Market cap</div>
        <div>Volume (24h)</div>
        <div>Circulating supply</div>
      </div>
      {rows.map((r) => (
        <Link
          key={r.symbol}
          href={`/ticker/${r.symbol}`}
          className="grid grid-cols-[40px_1.4fr_0.9fr_0.7fr_1fr_1fr_1fr] items-center border-b border-line px-5 py-3.5 last:border-b-0 hover:bg-active"
        >
          <div className="text-[12.5px] text-muted">{r.rank ?? "—"}</div>
          <div>
            <span className="text-sm text-primary">{r.name}</span>
            <span className="ml-2 text-[12px] text-muted">{r.symbol}</span>
          </div>
          <div className="text-[13.5px] text-primary">
            {r.price === null ? "—" : r.price.toLocaleString(undefined, { style: "currency", currency: "USD" })}
          </div>
          <div
            className={`text-[13px] ${
              r.changePct24h === null ? "text-muted" : r.changePct24h >= 0 ? "text-accent" : "text-negative"
            }`}
          >
            {r.changePct24h === null ? "—" : `${r.changePct24h >= 0 ? "+" : ""}${r.changePct24h.toFixed(2)}%`}
          </div>
          <div className="text-[13px] text-primary">{formatMarketCap(r.marketCap)}</div>
          <div className="text-[13px] text-muted">{formatMarketCap(r.volume24h)}</div>
          <div className="text-[13px] text-muted">
            {formatSupply(r.circulatingSupply)} {r.symbol}
          </div>
        </Link>
      ))}
    </div>
  );
}
