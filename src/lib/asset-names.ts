// The mock shows a company name under every symbol. Nothing in the schema
// carries one for equities - crypto_metrics.name covers crypto only - so the
// tracked equity/ETF universe is mapped here, and anything unmapped falls back
// to a caller-supplied label (asset type) rather than rendering an empty line.
const ASSET_NAMES: Record<string, string> = {
  AAPL: "Apple Inc.",
  AMZN: "Amazon.com, Inc.",
  GOOGL: "Alphabet Inc.",
  MSFT: "Microsoft Corporation",
  NVDA: "NVIDIA Corporation",
  SPY: "SPDR S&P 500 ETF Trust",
  TSLA: "Tesla, Inc.",
};

export function assetName(symbol: string, fallback: string): string {
  return ASSET_NAMES[symbol.toUpperCase()] ?? fallback;
}
