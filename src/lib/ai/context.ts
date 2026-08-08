import { createClient } from "@/lib/supabase/server";

// Same tracked list as supabase/functions/_shared/tagging.ts (kept in sync
// manually — one runs in Deno, the other in Node, no shared module between them).
const TRACKED: { symbol: string; aliases: string[] }[] = [
  { symbol: "AAPL", aliases: ["apple"] },
  { symbol: "MSFT", aliases: ["microsoft"] },
  { symbol: "NVDA", aliases: ["nvidia"] },
  { symbol: "GOOGL", aliases: ["google", "alphabet"] },
  { symbol: "AMZN", aliases: ["amazon"] },
  { symbol: "TSLA", aliases: ["tesla"] },
  { symbol: "SPY", aliases: [] },
];

function detectTickers(text: string): string[] {
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
}

// Relevance ranking only — never used to shape what's said, only which stored
// analyses are worth surfacing. Shared by chat context and the daily briefing.
export async function getUserSymbols(userId: string): Promise<string[]> {
  const supabase = await createClient();

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

export async function buildChatContext(userMessage: string, userId: string): Promise<ChatContext> {
  const supabase = await createClient();

  const mentioned = detectTickers(userMessage);
  const portfolioSymbols = await getUserSymbols(userId);

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

  return { analyses: analyses ?? [], news: news ?? [], relevantSymbols };
}
