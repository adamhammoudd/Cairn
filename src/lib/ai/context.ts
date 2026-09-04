import { createClient } from "@/lib/supabase/server";
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

// Exported so the chat-triggered generation path decides "which scope did they
// actually ask about" with the very same detection that decides which stored
// analyses are relevant. Two notions of "mentioned" would drift apart.
export function detectTickers(text: string): string[] {
  const found = new Set<string>();
  for (const t of TRACKED) {
    const terms = [t.symbol, ...t.aliases];
    if (terms.some((term) => new RegExp(`\\b${term}\\b`, "i").test(text))) found.add(t.symbol);
  }
  return Array.from(found);
}

export interface ChatContext {
  analyses: { id: string; scope_type: string; scope_value: string; analysis_type: string; probability_low: number; probability_high: number; confidence_level: string; reasoning_text: string; sample_size: number }[];
  news: { id: string; title: string; source_name: string; published_at: string }[];
  relevantSymbols: string[];
  // Real, code-computed portfolio figures for this turn, or null. Only ever
  // non-null when ENABLE_PORTFOLIO_CONTEXT is on and the user holds something -
  // see lib/ai/portfolio-summary.ts. The model may restate these verbatim and
  // nothing else (checkPortfolioFigureDrift enforces it).
  portfolio: PortfolioSummary | null;
}

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
  usePortfolioContext = true,
): Promise<ChatContext> {
  const supabase = client ?? (await createClient());

  const mentioned = detectTickers(userMessage);
  const portfolioSymbols = usePortfolioContext ? await getUserSymbols(userId, client) : [];

  // explicit mention in the message wins; otherwise fall back to portfolio symbols for relevance
  const relevantSymbols = mentioned.length > 0 ? mentioned : portfolioSymbols;

  let analysisQuery = supabase
    .from("ai_analyses")
    .select("id, scope_type, scope_value, analysis_type, probability_low, probability_high, confidence_level, reasoning_text, sample_size")
    .eq("status", "validated")
    .order("created_at", { ascending: false })
    .limit(6);
  if (relevantSymbols.length > 0) analysisQuery = analysisQuery.in("scope_value", relevantSymbols);
  const { data: analyses } = await analysisQuery;

  let newsQuery = supabase
    .from("news_items")
    .select("id, title, source_name, published_at")
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
