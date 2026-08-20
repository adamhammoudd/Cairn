// Types and formatters for the crypto overview. Kept out of
// lib/actions/crypto.ts for the same reason as lib/screener.ts - a
// "use server" module may only export async functions.

export interface CryptoRow {
  symbol: string;
  name: string;
  rank: number | null;
  price: number | null;
  changePct24h: number | null;
  marketCap: number | null;
  volume24h: number | null;
  circulatingSupply: number | null;
  maxSupply: number | null;
}

export function formatSupply(n: number | null): string {
  if (n === null) return "-";
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString();
}
