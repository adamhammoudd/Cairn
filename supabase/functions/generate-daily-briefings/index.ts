// Scheduled Edge Function: generates today's briefing for every user, mirroring
// src/lib/ai/briefing.ts's deterministic templating (no LLM call here either —
// same reasoning: everything referenced already passed the scope guard when it
// was generated in Phase 4, so templating it can't introduce a new claim).
// The on-demand path in the app duplicates this logic in TypeScript rather than
// calling out to this function, since Next.js server actions can't invoke a
// Deno Edge Function synchronously without a network round trip for no benefit.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: profiles, error: profilesError } = await supabase.from("profiles").select("user_id");
  if (profilesError) {
    return Response.json({ error: profilesError.message }, { status: 500, headers: corsHeaders });
  }

  const today = new Date().toISOString().slice(0, 10);
  const twoWeeksOut = new Date();
  twoWeeksOut.setDate(twoWeeksOut.getDate() + 14);
  const results = [];

  for (const { user_id } of profiles ?? []) {
    try {
      const [{ data: holdings }, { data: lists }] = await Promise.all([
        supabase.from("holdings").select("symbol").eq("user_id", user_id),
        supabase.from("watchlists").select("id").eq("user_id", user_id),
      ]);

      const listIds = (lists ?? []).map((l: { id: string }) => l.id);
      const { data: watchlistItems } = listIds.length
        ? await supabase.from("watchlist_items").select("symbol").in("watchlist_id", listIds)
        : { data: [] as { symbol: string }[] };

      const symbols = Array.from(
        new Set([
          ...(holdings ?? []).map((h: { symbol: string }) => h.symbol),
          ...(watchlistItems ?? []).map((w: { symbol: string }) => w.symbol),
        ]),
      );

      let analysisQuery = supabase
        .from("ai_analyses")
        .select("id, scope_value, analysis_type, probability_low, probability_high, confidence_level")
        .eq("status", "validated")
        .order("created_at", { ascending: false })
        .limit(10);
      if (symbols.length > 0) analysisQuery = analysisQuery.in("scope_value", symbols);
      const { data: analyses } = await analysisQuery;

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
          "No holdings or watchlist symbols yet — add some to get a personalized relevance ranking, or ask the assistant about any market/sector/ticker directly.";
      } else if (analysisList.length === 0 && eventList.length === 0) {
        summary = `No new research or upcoming events for your ${symbols.length} tracked symbol${symbols.length === 1 ? "" : "s"} since your last briefing.`;
      } else {
        const parts: string[] = [];
        if (analysisList.length > 0) {
          parts.push(
            `${analysisList.length} relevant analysis${analysisList.length === 1 ? "" : "es"}: ${analysisList
              .slice(0, 3)
              .map(
                (a: { scope_value: string; probability_low: number; probability_high: number; confidence_level: string }) =>
                  `${a.scope_value} (${a.probability_low}–${a.probability_high}%, ${a.confidence_level} confidence)`,
              )
              .join(", ")}${analysisList.length > 3 ? ", and more" : ""}.`,
          );
        }
        if (eventList.length > 0) {
          parts.push(
            `${eventList.length} upcoming event${eventList.length === 1 ? "" : "s"}: ${eventList
              .slice(0, 3)
              .map((e: { symbol: string | null; event_type: string; event_date: string }) => `${e.symbol ?? ""} ${e.event_type} on ${e.event_date}`.trim())
              .join(", ")}${eventList.length > 3 ? ", and more" : ""}.`,
          );
        }
        summary = parts.join(" ");
      }

      const content = {
        generated_at: new Date().toISOString(),
        relevant_symbols: symbols,
        summary,
        analyses: analysisList,
        upcoming_events: eventList,
      };

      const { error: upsertError } = await supabase
        .from("daily_briefings")
        .upsert({ user_id, briefing_date: today, content }, { onConflict: "user_id,briefing_date" });

      results.push({ user_id, ok: !upsertError, error: upsertError?.message });
    } catch (err) {
      results.push({ user_id, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return Response.json({ generated: results.length, results }, { headers: corsHeaders });
});
