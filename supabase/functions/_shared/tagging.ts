// Lightweight keyword tagging so ticker/sector-scoped analysis (Phase 4) has
// something to filter on. Not NLP — word-boundary matching against a small
// tracked list. Extend TRACKED_SYMBOLS as more symbols get ingested via
// ingest-market-data; a name here with no matching symbol still tags fine,
// it just won't join against historical_prices for that ticker yet.

interface TrackedSymbol {
  symbol: string;
  aliases: string[];
  sectors: string[];
}

const TRACKED: TrackedSymbol[] = [
  { symbol: "AAPL", aliases: ["apple"], sectors: ["technology"] },
  { symbol: "MSFT", aliases: ["microsoft"], sectors: ["technology"] },
  { symbol: "NVDA", aliases: ["nvidia"], sectors: ["technology", "semiconductors"] },
  { symbol: "GOOGL", aliases: ["google", "alphabet"], sectors: ["technology"] },
  { symbol: "AMZN", aliases: ["amazon"], sectors: ["technology", "retail"] },
  { symbol: "TSLA", aliases: ["tesla"], sectors: ["automotive", "technology"] },
  { symbol: "SPY", aliases: ["s&p 500", "s&p500"], sectors: [] },
];

const SECTOR_KEYWORDS: Record<string, string[]> = {
  semiconductors: ["semiconductor", "chip maker", "chipmaker", "foundry"],
  technology: ["tech stocks", "software company", "cloud computing", "artificial intelligence", "ai chip"],
  automotive: ["automaker", "electric vehicle", "ev maker"],
  retail: ["e-commerce", "retailer"],
  macro: ["federal reserve", "interest rate", "inflation report", "jobs report", "gdp growth"],
};

function wordBoundaryMatch(text: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(text);
}

export function tagContent(title: string, body: string | null): { tickers: string[]; sectors: string[] } {
  const text = `${title} ${body ?? ""}`;
  const tickers = new Set<string>();
  const sectors = new Set<string>();

  for (const t of TRACKED) {
    const matched =
      wordBoundaryMatch(text, t.symbol) || t.aliases.some((a) => wordBoundaryMatch(text, a));
    if (matched) {
      tickers.add(t.symbol);
      for (const s of t.sectors) sectors.add(s);
    }
  }

  for (const [sector, keywords] of Object.entries(SECTOR_KEYWORDS)) {
    if (keywords.some((k) => text.toLowerCase().includes(k))) sectors.add(sector);
  }

  return { tickers: Array.from(tickers), sectors: Array.from(sectors) };
}
