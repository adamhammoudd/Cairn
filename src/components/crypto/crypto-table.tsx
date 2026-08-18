import Link from "next/link";
import { formatMarketCap } from "@/lib/screener";
import { formatSupply, type CryptoRow } from "@/lib/crypto";

export function CryptoTable({ rows }: { rows: CryptoRow[] }) {
  if (rows.length === 0) {
    return (
      <div>
        No crypto data yet — ingestion may not have run.
      </div>
    );
  }

  return (
    <div>
      <div>
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

 >
          <div>{r.rank ?? "—"}</div>
          <div>
            <span>{r.name}</span>
            <span>{r.symbol}</span>
          </div>
          <div>
            {r.price === null ? "—" : r.price.toLocaleString(undefined, { style: "currency", currency: "USD" })}
          </div>
          <div

 >
            {r.changePct24h === null ? "—" : `${r.changePct24h >= 0 ? "+" : ""}${r.changePct24h.toFixed(2)}%`}
          </div>
          <div>{formatMarketCap(r.marketCap)}</div>
          <div>{formatMarketCap(r.volume24h)}</div>
          <div>
            {formatSupply(r.circulatingSupply)} {r.symbol}
          </div>
        </Link>
      ))}
    </div>
  );
}
