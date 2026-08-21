// Editorial gate for the market-wide news feed.
//
// Why this exists
// ---------------
// The verification audit found the market feed carrying rental-property tax
// questions and phishing-warning articles. Neither is wrong as journalism -
// they come from real finance publishers - but Cairn's feed makes a narrower
// promise: market, sector and ticker news. Consumer personal-finance service
// pieces dilute that promise, and worse, they are the items most likely to be
// mistaken for something the analysis engine could act on.
//
// The shape of the rule
// ---------------------
// Anything the tagger already matched to a tracked ticker or sector is market
// news by construction and passes untouched - that keeps the holdings/watchlist
// relevance ranking (confirmed working in the audit) from regressing, since an
// item about a symbol a user holds can never be dropped here.
//
// Everything else must show a MARKET SIGNAL to survive. This is deliberately
// default-deny: an item in the market-wide feed that mentions no ticker, no
// sector, and no market concept has not earned its place, and the failure mode
// of default-allow is precisely what the audit found. The consumer lexicon is
// kept separate rather than folded into "no signal" so the reason recorded for
// a drop distinguishes "off-topic" from "consumer service piece" - useful when
// deciding whether to re-weight a source rather than filter it.
//
// This is a lexicon, so it has edges, and it is a FEED filter, not a safety
// gate - the cost of a wrong call is one story, not a compliance failure.

export type EditorialVerdict =
  | { keep: true; reason: "tagged" | "market_signal" }
  | { keep: false; reason: "consumer_personal_finance" | "no_market_signal" };

// Market/finance concepts. Broad on purpose: the goal is to exclude consumer
// service journalism, not to curate a narrow beat.
const MARKET_SIGNAL = new RegExp(
  [
    // instruments and venues
    "\\bstocks?\\b", "\\bshares?\\b", "\\bequit(?:y|ies)\\b", "\\bbonds?\\b", "\\btreasur(?:y|ies)\\b",
    "\\byields?\\b", "\\bcommodit(?:y|ies)\\b", "\\bfutures\\b", "\\boptions?\\b", "\\betfs?\\b",
    "\\bcrypto(?:currenc(?:y|ies))?\\b", "\\bbitcoin\\b", "\\bethereum\\b", "\\btokens?\\b",
    "\\bnasdaq\\b", "\\bs&p\\b", "\\bdow\\b", "\\bftse\\b", "\\bnikkei\\b", "\\bwall street\\b",
    // market action
    "\\bmarkets?\\b", "\\brall(?:y|ies|ied)\\b", "\\bselloff\\b", "\\bsell-off\\b", "\\bvolatilit(?:y|ies)\\b",
    "\\bbear market\\b", "\\bbull market\\b", "\\bcorrection\\b", "\\bindex(?:es)?\\b", "\\bindices\\b",
    // corporate events
    "\\bearnings\\b", "\\brevenue\\b", "\\bguidance\\b", "\\bprofits?\\b", "\\bquarterly results\\b",
    "\\bipo\\b", "\\bmerger\\b", "\\bacquisition\\b", "\\bbuyback\\b", "\\bdividends?\\b",
    "\\bstock split\\b", "\\bdowngrade[ds]?\\b", "\\bupgrade[ds]?\\b", "\\banalysts?\\b", "\\bvaluation\\b",
    "\\bmarket cap\\b", "\\bshareholders?\\b", "\\b8-k\\b", "\\b10-[kq]\\b",
    // "filing" alone is not a market signal: it also appears in "tax filing
    // season", which is precisely the consumer content this gate exists to
    // drop. The regression test pins that case.
    "\\b(?:sec|regulatory|proxy|quarterly|annual) filings?\\b",
    // macro
    "\\bfederal reserve\\b", "\\bthe fed\\b", "\\bfomc\\b", "\\bcentral bank\\b", "\\becb\\b",
    "\\binflation\\b", "\\bcpi\\b", "\\bppi\\b", "\\binterest rates?\\b", "\\brate (?:cut|hike)s?\\b",
    "\\bgdp\\b", "\\brecession\\b", "\\bunemployment\\b", "\\bpayrolls?\\b", "\\btariffs?\\b",
    "\\bsupply chain\\b", "\\bearnings season\\b",
    // participants
    "\\binvestors?\\b", "\\btraders?\\b", "\\bhedge funds?\\b", "\\binstitutional\\b", "\\bsec\\b",
  ].join("|"),
  "i",
);

// Consumer personal-finance and consumer-protection service journalism. These
// are the categories the audit actually found in the feed.
const CONSUMER_PERSONAL = new RegExp(
  [
    "\\brental propert(?:y|ies)\\b", "\\blandlords?\\b", "\\btenants?\\b", "\\bmortgage rates? today\\b",
    "\\bphishing\\b", "\\bscams?\\b", "\\bfraud alert\\b", "\\bidentity theft\\b",
    "\\bcredit cards?\\b", "\\bcredit score\\b", "\\bcoupons?\\b", "\\bcashback\\b", "\\brewards? points?\\b",
    "\\bstudent loans?\\b", "\\bpersonal loans?\\b", "\\bpayday\\b",
    "\\bhow (?:to|i) (?:save|budget|retire|pay off)\\b", "\\bbudgeting tips?\\b", "\\bsave money on\\b",
    "\\btax (?:deduction|refund|filing|season|write-?offs?)\\b", "\\bira contribution\\b",
    "\\bsocial security benefits?\\b", "\\bmedicare\\b", "\\blife insurance\\b", "\\bcar insurance\\b",
    "\\bbest (?:savings|checking) accounts?\\b", "\\bemergency fund\\b",
  ].join("|"),
  "i",
);

/**
 * Decides whether an ingested item belongs in the market-wide feed.
 *
 * @param title   headline as published
 * @param body    summary/description, may be null
 * @param tickers symbols the tagger matched (empty array if none)
 * @param sectors sectors the tagger matched (empty array if none)
 */
export function editorialVerdict(
  title: string,
  body: string | null,
  tickers: string[],
  sectors: string[],
): EditorialVerdict {
  // Already tied to something Cairn tracks: keep it regardless of wording, so
  // holdings-relevance ranking can never lose an item to this filter.
  if (tickers.length > 0 || sectors.length > 0) return { keep: true, reason: "tagged" };

  const text = `${title}\n${body ?? ""}`;
  const hasMarketSignal = MARKET_SIGNAL.test(text);

  // A consumer-finance topic can still be market news ("Credit card
  // delinquencies hit bank earnings"), so the market signal wins the tie rather
  // than the consumer lexicon acting as an unconditional veto.
  if (CONSUMER_PERSONAL.test(text) && !hasMarketSignal) {
    return { keep: false, reason: "consumer_personal_finance" };
  }
  if (!hasMarketSignal) return { keep: false, reason: "no_market_signal" };
  return { keep: true, reason: "market_signal" };
}
