// Lightweight keyword tagging so ticker/sector-scoped analysis (Phase 4) has
// something to filter on. Not NLP — word-boundary matching against a tracked
// list. A name here with no matching symbol still tags fine, it just won't
// join against historical_prices for that ticker yet.
//
// Equities are a curated list (a ticker needs a company alias to be findable
// in prose, and that mapping cannot be derived). Crypto is passed in at call
// time from crypto_metrics, because the tracked coin set is the CoinGecko
// top-N by market cap and rotates — hardcoding it would go stale silently.
// Before this, the tagger knew only the 7 equity symbols, so no crypto scope
// could ever clear the "must cite at least one source" gate.

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
  macro: ["federal reserve", "fed minutes", "fomc", "rate cut", "rate hike", "interest rate", "inflation report", "jobs report", "gdp growth"],
  crypto: ["cryptocurrency", "crypto market", "crypto prices", "stablecoin", "digital asset", "blockchain", "spot bitcoin etf", "defi"],
};

// Coin symbols are short and collide with ordinary English (CC, LEO, GRAM,
// RAIN, HYPE are all live top-25 tickers), so a symbol only matches
// case-sensitively and only at 3+ characters, and a coin name only matches at
// 5+. That trades a little recall for not tagging a story about rain as RAIN.
// ponytail: heuristic thresholds; a proper entity linker is the upgrade path
// if precision here ever matters more than it does today.
const MIN_CRYPTO_SYMBOL_LEN = 3;
const MIN_CRYPTO_NAME_LEN = 5;

// Aliases the coin name alone does not cover.
const CRYPTO_ALIASES: Record<string, string[]> = {
  BTC: ["bitcoin"],
  ETH: ["ethereum", "ether"],
  XRP: ["ripple"],
  DOGE: ["dogecoin"],
};

export interface CryptoUniverseEntry {
  symbol: string;
  name: string | null;
}

function wordBoundaryMatch(text: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(text);
}

function caseSensitiveWordMatch(text: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`).test(text);
}

export function tagContent(
  title: string,
  body: string | null,
  cryptoUniverse: CryptoUniverseEntry[] = [],
): { tickers: string[]; sectors: string[] } {
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

  for (const coin of cryptoUniverse) {
    const symbol = coin.symbol.toUpperCase();
    const aliases = [
      ...(CRYPTO_ALIASES[symbol] ?? []),
      ...(coin.name && coin.name.length >= MIN_CRYPTO_NAME_LEN ? [coin.name] : []),
    ];
    const matched =
      (symbol.length >= MIN_CRYPTO_SYMBOL_LEN && caseSensitiveWordMatch(text, symbol)) ||
      aliases.some((a) => wordBoundaryMatch(text, a));
    if (matched) {
      tickers.add(symbol);
      sectors.add("crypto");
    }
  }

  for (const [sector, keywords] of Object.entries(SECTOR_KEYWORDS)) {
    if (keywords.some((k) => text.toLowerCase().includes(k))) sectors.add(sector);
  }

  return { tickers: Array.from(tickers), sectors: Array.from(sectors) };
}
