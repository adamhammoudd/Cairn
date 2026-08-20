import { createClient } from "@/lib/supabase/server";
import { getUserSymbols } from "@/lib/ai/context";

export interface BriefingContent {
  generated_at: string;
  relevant_symbols: string[];
  summary: string;
  analyses: {
    id: string;
    scope_value: string;
    analysis_type: string;
    probability_low: number;
    probability_high: number;
    confidence_level: string;
  }[];
  upcoming_events: { symbol: string | null; event_type: string; event_date: string; title: string }[];
}

// Deliberately deterministic, no LLM call: everything referenced here already
// passed the scope guard when it was generated (Phase 4), so templating it
// into a briefing can't introduce a new personal-directive or fabricated
// number the way a fresh generation call could.
export async function generateBriefing(userId: string): Promise<BriefingContent> {
  const supabase = await createClient();
  const symbols = await getUserSymbols(userId);

  let analysisQuery = supabase
    .from("ai_analyses")
    .select("id, scope_value, analysis_type, probability_low, probability_high, confidence_level")
    .eq("status", "validated")
    .order("created_at", { ascending: false })
    .limit(10);
  if (symbols.length > 0) analysisQuery = analysisQuery.in("scope_value", symbols);
  const { data: analyses } = await analysisQuery;

  const today = new Date().toISOString().slice(0, 10);
  const twoWeeksOut = new Date();
  twoWeeksOut.setDate(twoWeeksOut.getDate() + 14);

  let eventsQuery = supabase
    .from("calendar_events")
    .select("symbol, event_type, event_date, title")
    .gte("event_date", today)
    .lte("event_date", twoWeeksOut.toISOString().slice(0, 10))
    .order("event_date", { ascending: true })
    .limit(10);
  if (symbols.length > 0) eventsQuery = eventsQuery.in("symbol", symbols);
  const { data: events } = await eventsQuery;

  const analysisList = analyses ?? [];
  const eventList = events ?? [];

  let summary: string;
  if (symbols.length === 0) {
    summary =
      "No holdings or watchlist symbols yet - add some to get a personalized relevance ranking, or ask the assistant about any market/sector/ticker directly.";
  } else if (analysisList.length === 0 && eventList.length === 0) {
    summary = `No new research or upcoming events for your ${symbols.length} tracked symbol${symbols.length === 1 ? "" : "s"} since your last briefing.`;
  } else {
    const parts: string[] = [];
    if (analysisList.length > 0) {
      parts.push(
        `${analysisList.length} relevant analysis${analysisList.length === 1 ? "" : "es"}: ${analysisList
          .slice(0, 3)
          .map((a) => `${a.scope_value} (${a.probability_low}–${a.probability_high}%, ${a.confidence_level} confidence)`)
          .join(", ")}${analysisList.length > 3 ? ", and more" : ""}.`,
      );
    }
    if (eventList.length > 0) {
      parts.push(
        `${eventList.length} upcoming event${eventList.length === 1 ? "" : "s"}: ${eventList
          .slice(0, 3)
          .map((e) => `${e.symbol ?? ""} ${e.event_type} on ${e.event_date}`.trim())
          .join(", ")}${eventList.length > 3 ? ", and more" : ""}.`,
      );
    }
    summary = parts.join(" ");
  }

  const content: BriefingContent = {
    generated_at: new Date().toISOString(),
    relevant_symbols: symbols,
    summary,
    analyses: analysisList,
    upcoming_events: eventList,
  };

  await supabase
    .from("daily_briefings")
    .upsert(
      { user_id: userId, briefing_date: today, content: content as unknown as Record<string, unknown> },
      { onConflict: "user_id,briefing_date" },
    );

  return content;
}
