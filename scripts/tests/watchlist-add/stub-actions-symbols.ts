// Stand-in for src/lib/actions/symbols.ts: a fixed directory instead of the
// symbol_directory table. Every row is "tracked", so pick() commits without an
// ingest round trip.
import type { SymbolSearchResult } from "@/lib/actions/symbols";

export type { SymbolSearchResult } from "@/lib/actions/symbols";

const DIRECTORY: SymbolSearchResult[] = [
  { symbol: "TSLA", assetType: "equity", name: "Tesla, Inc.", availability: "tracked" },
  { symbol: "TSLL", assetType: "etf", name: "Direxion Daily TSLA Bull 2X", availability: "tracked" },
  { symbol: "NVDA", assetType: "equity", name: "NVIDIA Corporation", availability: "tracked" },
  { symbol: "ISRG", assetType: "equity", name: "Intuitive Surgical", availability: "tracked" },
];

export async function searchSymbols(q: string): Promise<SymbolSearchResult[]> {
  const u = q.trim().toUpperCase();
  return DIRECTORY.filter((r) => r.symbol.startsWith(u));
}

export async function lookupSymbol(): Promise<SymbolSearchResult | null> {
  return null;
}
