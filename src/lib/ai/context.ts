import { createClient } from "@/lib/supabase/server";
import { summaryLine, type AnalysisRowLike } from "@/lib/analysis-display";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureSymbolIngested } from "@/lib/market-data/ingest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import {
  buildPortfolioSummary,
  portfolioContextEnabled,
  type PortfolioSummary,
} from "@/lib/ai/portfolio-summary";

// Same tracked list as supabase/functions/_shared/tagging.ts (kept in sync
// manually - one runs in Deno, the other in Node, no shared module between them).
const TRACKED: { symbol: string; aliases: string[] }[] = [
  { symbol: "AAPL", aliases: ["apple"] },
  { symbol: "MSFT", aliases: ["microsoft"] },
  { symbol: "NVDA", aliases: ["nvidia"] },
  { symbol: "GOOGL", aliases: ["google", "alphabet"] },
  { symbol: "AMZN", aliases: ["amazon"] },
  { symbol: "TSLA", aliases: ["tesla"] },
  { symbol: "SPY", aliases: [] },
];

// Words that are routinely typed in capitals without meaning a ticker. Only a
// cashtag ($AI) overrides this; a bare "AI" or "ALL" in a sentence does not.
const COMMON_CAPS = new Set([
  "AI", "ALL", "AN", "AND", "ARE", "AS", "AT", "BE", "BUT", "BY", "CAN", "CEO", "CFO", "CPI", "DO", "ETF", "EPS", "EU",
  "FED", "FOMC", "FOR", "FROM", "GDP", "HAS", "HOW", "IF", "IN", "IPO", "IS", "IT", "ITS", "MY", "NO", "NOT", "NOW",
  "OF", "ON", "OR", "OUT", "PE", "QE", "SEC", "SO", "THE", "TO", "UK", "UP", "US", "USA", "USD", "VS", "WAS", "WHAT",
  "WHEN", "WHO", "WHY", "WILL", "WITH", "YOU", "YTD",
]);

/**
 * Most unrecognised tokens a single message may send to the market-data
 * provider. A message is untrusted input; without a cap, a paragraph of
 * capitalised words is a paragraph of outbound requests. Negative results are
 * cached for a day in symbol_directory, so a repeated token costs nothing.
 */
const MAX_ON_DEMAND_LOOKUPS = 2;

// Exported so the chat-triggered generation path decides "which scope did they
// actually ask about" with the very same detection that decides which stored
// analyses are relevant. Two notions of "mentioned" would drift apart.
//
// Recognition is no longer a closed list. In order:
//   1. company names / symbols in TRACKED (needs no lookup - "apple" -> AAPL);
//   2. candidate tokens - $cashtags, and 2-5 letter ALL-CAPS words - checked
//      against symbol_directory in one query; only status "available" counts,
//      so a delisted ticker or a typo the provider already refused is ignored;
//   3. tokens the directory has never seen get one on-demand ingestion attempt
//      (ensureSymbolIngested), capped at MAX_ON_DEMAND_LOOKUPS per message, and
//      only when the message is not entirely capitals (where every word looks
//      like a ticker). Single letters are only accepted as a $cashtag.
export async function detectTickers(text: string, client?: SupabaseClient<Database>): Promise<string[]> {
  const found = new Set<string>();
  for (const t of TRACKED) {
    const terms = [t.symbol, ...t.aliases];
    if (terms.some((term) => new RegExp(`\\b${term}\\b`, "i").test(text))) found.add(t.symbol);
  }

  const cashtags = Array.from(text.matchAll(/\$([A-Za-z]{1,5})\b/g), (m) => m[1].toUpperCase());
  const caps = Array.from(text.matchAll(/\b[A-Z]{2,5}\b/g), (m) => m[0]).filter((t) => !COMMON_CAPS.has(t));
  const candidates = Array.from(new Set([...cashtags, ...caps])).filter((c) => !found.has(c));
  if (candidates.length === 0) return Array.from(found);

  const supabase = client ?? (await createClient());
  const { data: known } = await supabase.from("symbol_directory").select("symbol, status").in("symbol", candidates);
  const statusBySymbol = new Map((known ?? []).map((r) => [r.symbol as string, r.status as string]));

  const toLookup: string[] = [];
  for (const c of candidates) {
    const status = statusBySymbol.get(c);
    if (status === "available") found.add(c);
    else if (status === undefined) toLookup.push(c);
    // any other status: the provider already said no (or is cooling down) - skip.
  }

  const hasLowercase = /[a-z]/.test(text);
  if (hasLowercase || cashtags.length > 0) {
    // Cashtags first: an explicit $XYZ is the strongest signal a token is a ticker.
    const ordered = [...toLookup].sort((x, y) => Number(cashtags.includes(y)) - Number(cashtags.includes(x)));
    for (const symbol of ordered.slice(0, MAX_ON_DEMAND_LOOKUPS)) {
      if (!hasLowercase && !cashtags.includes(symbol)) continue;
      const result = await ensureSymbolIngested(symbol);
      if (result.status === "available") found.add(result.symbol);
    }
  }

  return Array.from(found);
}

export interface ChatContext {
  /**
   * reasoning_text is the analysis HEADLINE and history_line its "higher in X
   * of N" line (lib/analysis-display.ts summaryLine), for old and new rows
   * alike. probability_low/high stay server-side for the existing guard code;
   * the model and the reader never see them (the >=5% band is Premium).
   */
  analyses: { id: string; scope_type: string; scope_value: string; analysis_type: string; probability_low: number; probability_high: number; confidence_level: string; reasoning_text: string; sample_size: number; history_line: string }[];
  // `url` is what lets the model follow the system prompt's own instruction
  // to cite with a real `[label](url)` link instead of falling back to some
  // other notation for a source it has no href for (see lib/ai/citations.ts).
  news: { id: string; title: string; source_name: string; url: string | null; published_at: string }[];
  relevantSymbols: string[];
  // Real, code-computed portfolio figures for this turn, or null. Only ever
  // non-null when ENABLE_PORTFOLIO_CONTEXT is on and the user holds something -
  // see lib/ai/portfolio-summary.ts. The model may restate these verbatim and
  // nothing else (checkPortfolioFigureDrift enforces it).
  portfolio: PortfolioSummary | null;
}

/**
 * How many stored analyses one answer may cite.
 *
 * Each one renders as a full methodology card - claim, probability range,
 * confidence, sources and analogs - so six of them buried the reply that was
 * supposed to be the point. Two is enough to compare against, and an answer
 * that needs more than two is really two questions.
 */
const MAX_CONTEXT_ANALYSES = 2;

// Relevance ranking only - never used to shape what's said, only which stored
// analyses are worth surfacing. Shared by chat context and the daily briefing.
//
// `client` is optional and only meant for contexts with no Next.js request
// scope to grab the request-scoped client from (the Section 7 test suite,
// which calls runChatTurn directly) - every real request path leaves it
// unset and gets the normal request-scoped client.
export async function getUserSymbols(userId: string, client?: SupabaseClient<Database>): Promise<string[]> {
  const supabase = client ?? (await createClient());

  const [{ data: holdings }, { data: watchlistItems }] = await Promise.all([
    supabase.from("holdings").select("symbol").eq("user_id", userId),
    supabase
      .from("watchlists")
      .select("id")
      .eq("user_id", userId)
      .then(async ({ data: lists }) => {
        const ids = (lists ?? []).map((l) => l.id);
        if (ids.length === 0) return { data: [] as { symbol: string }[] };
        return supabase.from("watchlist_items").select("symbol").in("watchlist_id", ids);
      }),
  ]);

  return Array.from(new Set([...(holdings ?? []).map((h) => h.symbol), ...(watchlistItems ?? []).map((w) => w.symbol)]));
}

export async function buildChatContext(
  userMessage: string,
  userId: string,
  client?: SupabaseClient<Database>,
  // Settings > AI Assistant "Portfolio context", overridable per conversation.
  // Off means holdings and watchlists are never read for relevance -- an
  // unprompted question then falls back to the newest validated analyses and
  // news rather than the user's own symbols. This only changes WHICH stored
  // analyses surface; it cannot change what the assistant is allowed to say,
  // which the scope guard enforces server-side either way.
  usePortfolioContext = false,
): Promise<ChatContext> {
  const supabase = client ?? (await createClient());

  const mentioned = await detectTickers(userMessage, client);
  const portfolioSymbols = usePortfolioContext ? await getUserSymbols(userId, client) : [];

  // explicit mention in the message wins; otherwise fall back to portfolio symbols for relevance
  const relevantSymbols = mentioned.length > 0 ? mentioned : portfolioSymbols;

  // Relevant analyses, or none.
  //
  // The `.in()` filter was conditional, so a question naming no ticker - with
  // Portfolio context off, leaving nothing to fall back on - ran the query
  // unfiltered and returned "the newest 6 validated analyses" whatever they
  // were about. Ask "what's moving semiconductors this week" and the answer
  // came back with an AMZN analysis and three separate BTC ones stapled
  // underneath, each rendered as a full methodology card.
  //
  // Unrelated evidence beneath a claim is worse than no evidence: it reads as
  // support and invites the reader to join it to the argument. An answer with
  // nothing relevant on file should say so - and it already does, pointing at
  // the Research page - rather than dressing itself in whatever happened to be
  // generated last.
  let analyses: ChatContext["analyses"] = [];
  if (relevantSymbols.length > 0) {
    // Service role: migration 0053 closed ai_analyses to signed-in reads.
    const { data } = await createAdminClient()
      .from("ai_analyses")
      .select(
        "id, scope_type, scope_value, analysis_type, probability_low, probability_high, confidence_level, reasoning_text, sample_size, created_at, plain_summary, headline, text_source, direction_n, direction_higher, direction_horizon_sessions, direction_confidence, direction_p25, direction_median, direction_p75, direction_worst, direction_best",
      )
      .eq("status", "validated")
      // Current analyses only: a regenerated one supersedes the old (migration 0054).
      .is("superseded_by", null)
      .in("scope_value", relevantSymbols)
      .order("created_at", { ascending: false })
      .limit(12);

    // One card per scope and type. Re-running the same analysis stores a new
    // row each time, and the briefing was listing "BTC 21-100%" three times
    // over - three runs of one question is one piece of evidence, not three.
    // Ordered newest-first above, so the first of each pair is the current one.
    const seen = new Set<string>();
    analyses = (data ?? [])
      .filter((a) => {
        const key = `${a.scope_type}:${a.scope_value}:${a.analysis_type}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, MAX_CONTEXT_ANALYSES)
      .map((a) => {
        const line = summaryLine(a as unknown as AnalysisRowLike, a.scope_value, null);
        return {
          id: a.id,
          scope_type: a.scope_type,
          scope_value: a.scope_value,
          analysis_type: a.analysis_type,
          probability_low: a.probability_low,
          probability_high: a.probability_high,
          confidence_level: a.confidence_level,
          reasoning_text: line.headline,
          sample_size: a.sample_size,
          history_line: line.historyLine,
        };
      });
  }

  let newsQuery = supabase
    .from("news_items")
    .select("id, title, source_name, url, published_at")
    .order("published_at", { ascending: false })
    .limit(6);
  if (relevantSymbols.length > 0) {
    newsQuery = newsQuery.overlaps("tickers", relevantSymbols);
  }
  const { data: news } = await newsQuery;

  // Portfolio figures are injected only when the feature is switched on AND the
  // per-conversation / account "portfolio context" setting is on. Detail is
  // scoped to the tickers the message actually names and the user holds -
  // `mentioned` is the same detection that picks relevant analyses, so the two
  // notions of "asked about" cannot drift.
  let portfolio: PortfolioSummary | null = null;
  if (usePortfolioContext && portfolioContextEnabled()) {
    try {
      portfolio = await buildPortfolioSummary(userId, mentioned, client);
    } catch (err) {
      // A summary that cannot be computed (market-data read failed, no request
      // scope) must never fail the turn - the assistant just answers without it.
      console.error("[chat] portfolio summary unavailable, continuing without it:", err);
    }
  }

  return { analyses: analyses ?? [], news: news ?? [], relevantSymbols, portfolio };
}
