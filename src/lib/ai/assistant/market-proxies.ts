// Broad market, country and theme questions -> the funds Cairn already tracks
// (fix/assistant-empty-answers).
//
// "What do you think about the Chinese stock market" is not a ticker. Cairn does
// not track China's market, but a fund that holds part of it may be among the
// symbols it already stores. This file only NAMES candidates; the tool keeps a
// candidate only if Cairn really has prices for it (the symbol is stored), and
// shows it labelled as a proxy. Nothing here adds a symbol or a feed: a
// candidate Cairn doesn't store is silently skipped, and a region with no
// stored candidate is answered with an honest "not tracked".
//
// Production's tracked funds on 2026-10-01 (symbol_directory, asset_type etf):
// ARKG EEM GDX GLD IWM JEPI NVD SCHD SPY TLT VNQ XLE. So today: China ->
// EEM (emerging markets, China is one part), emerging markets -> EEM, the US
// -> SPY and IWM, oil -> XLE; Europe, Japan, India, UK, Asia and AI have none.

export interface MarketTopic {
  key: string;
  /** Short name used in the news search and the labels: "China", "oil". */
  label: string;
  /** How the market is named in a sentence: "China's market". */
  direct: string;
  terms: RegExp;
  /** Funds that would be proxies, in preference order. Only the ones Cairn stores are shown. */
  candidates: string[];
  /** True when the candidates ARE the market (emerging markets -> EEM), not a stand-in for it. */
  exact: boolean;
  /** Caveats about specific proxies, in words with no figures. */
  notes?: Record<string, string>;
}

export const MARKET_TOPICS: MarketTopic[] = [
  { key: "china", label: "China", direct: "China's market", terms: /\b(?:chin(?:a|ese)|hong\s+kong|hang\s+seng|shanghai|shenzhen|csi\s?300)\b/i, candidates: ["FXI", "MCHI", "KWEB", "ASHR", "EEM"], exact: false, notes: { EEM: "EEM covers emerging markets as a whole, so China is only part of what it holds." } },
  { key: "emerging", label: "emerging markets", direct: "emerging markets", terms: /\bemerging\s+markets?\b|\bem\s+(?:stocks|equities)\b/i, candidates: ["EEM", "VWO", "IEMG"], exact: true },
  { key: "europe", label: "Europe", direct: "Europe's market", terms: /\b(?:europe(?:an)?|eurozone|euro\s+area|stoxx|dax)\b/i, candidates: ["VGK", "EZU", "FEZ", "IEV", "EFA"], exact: false },
  { key: "japan", label: "Japan", direct: "Japan's market", terms: /\b(?:japan(?:ese)?|nikkei|topix)\b/i, candidates: ["EWJ", "DXJ"], exact: false },
  { key: "india", label: "India", direct: "India's market", terms: /\b(?:india(?:n)?|nifty|sensex)\b/i, candidates: ["INDA", "EPI", "SMIN"], exact: false },
  { key: "uk", label: "the UK", direct: "the UK's market", terms: /\b(?:uk|u\.k\.|british|britain|ftse)\b/i, candidates: ["EWU"], exact: false },
  { key: "asia", label: "Asia", direct: "Asia's markets", terms: /\basia(?:n)?\b/i, candidates: ["AAXJ", "VPL"], exact: false },
  { key: "world", label: "global stocks", direct: "the world's stock markets", terms: /\b(?:global|world|international)\s+(?:stocks?|markets?|equities)\b/i, candidates: ["VT", "ACWI", "URTH"], exact: false },
  { key: "ai", label: "AI", direct: "AI stocks", terms: /\b(?:ai|a\.i\.|artificial\s+intelligence|semiconductors?|chip(?:s|makers?)?)\s+(?:stocks?|shares|companies|sector|etfs?|funds?|theme|industry)\b/i, candidates: ["BOTZ", "AIQ", "SMH", "SOXX", "ARKQ"], exact: false },
  { key: "oil", label: "oil", direct: "the oil price", terms: /\b(?:oil|crude)\b/i, candidates: ["USO", "BNO", "XLE"], exact: false, notes: { XLE: "XLE holds the shares of energy companies; it is not the oil price itself." } },
  { key: "gold", label: "gold", direct: "gold", terms: /\bgold\b/i, candidates: ["GLD", "IAU"], exact: true },
  { key: "bonds", label: "bonds", direct: "bonds", terms: /\b(?:bonds?|treasur(?:y|ies))\b/i, candidates: ["TLT", "IEF", "BND"], exact: false, notes: { TLT: "TLT holds long-dated US government bonds only." } },
  { key: "property", label: "real estate", direct: "real estate", terms: /\b(?:real\s+estate|reits?)\b/i, candidates: ["VNQ"], exact: false },
  { key: "smallcaps", label: "small companies", direct: "small companies' shares", terms: /\bsmall[- ]caps?\b|\bsmall\s+companies\b/i, candidates: ["IWM"], exact: true },
  { key: "us", label: "the US market", direct: "the US stock market", terms: /\b(?:u\.?s\.?\s+(?:stocks?|market|equities|shares)|american\s+(?:stocks|market)|wall\s+street|(?:the\s+)?stock\s+market|the\s+market)\b/i, candidates: ["SPY", "QQQ", "VOO", "IWM"], exact: false },
];

/** Funds Cairn tracks that stand for broad markets, shown when a region has no proxy ("what it does track"). */
export const BROAD_TRACKED = ["SPY", "IWM", "EEM", "TLT", "GLD", "VNQ", "XLE"];

/** Words that make a topic word a question about a market ("European stocks", "oil prices"). */
const MARKET_WORDS = /\b(?:stocks?|shares|markets?|equit(?:y|ies)|economy|funds?|etfs?|index|indices|sector|doing|looking|prices?|performing|outlook)\b/i;

/** Topics a message is about, in the order it names them. Empty when it isn't a market question. */
export function matchMarketTopics(message: string): MarketTopic[] {
  const hits = MARKET_TOPICS.map((t) => ({ t, at: message.search(t.terms) })).filter((h) => h.at >= 0);
  return hits.sort((a, b) => a.at - b.at).map((h) => h.t);
}

/** A question about a whole market, country or theme (as opposed to a ticker). */
export function marketTopicFor(message: string): MarketTopic | null {
  if (!MARKET_WORDS.test(message)) return null;
  // The generic US topic ("the market") must not beat a more specific one.
  const topics = matchMarketTopics(message);
  return topics.find((t) => t.key !== "us") ?? topics[0] ?? null;
}
