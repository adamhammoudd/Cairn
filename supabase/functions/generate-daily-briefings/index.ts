// Scheduled Edge Function: generates today's briefing for the users whose
// chosen delivery hour is the one currently running, mirroring
// src/lib/ai/briefing.ts's deterministic templating (no LLM call here either -
// same reasoning: everything referenced already passed the scope guard when it
// was generated in Phase 4, so templating it can't introduce a new claim).
// The on-demand path in the app duplicates this logic in TypeScript rather than
// calling out to this function, since Next.js server actions can't invoke a
// Deno Edge Function synchronously without a network round trip for no benefit.
//
// Scheduling (migration 0031): this used to run once, at 12:00 UTC on
// weekdays, for everybody. It now runs at the top of every hour and each run
// generates only for the users whose local wall-clock hour (user_settings
// .briefing_hour_local resolved in briefing_timezone) is the current one -
// which is what makes the "Daily briefing delivery time" control in Settings
// change when the job actually fires for that user, rather than storing a
// number nothing reads.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { requireCronSecret } from "../_shared/auth.ts";
import { priceMovesFromBars, type MoveBar } from "../_shared/price-moves.ts";

interface BriefingSettings {
  user_id: string;
  briefing_hour_local: number | null;
  briefing_timezone: string | null;
  briefing_include_holdings: boolean | null;
  briefing_watchlist_ids: string[] | null;
  briefing_news_categories: string[] | null;
}

/**
 * The wall-clock hour it currently is in `timeZone`. Intl does the DST
 * arithmetic, so there is no offset table here to drift - the same approach
 * src/lib/market-hours.ts takes for the New York session.
 *
 * An unknown or malformed zone throws inside Intl; that falls back to UTC
 * rather than skipping the user's briefing entirely.
 */
function hourInZone(at: Date, timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "2-digit",
      hour12: false,
    }).formatToParts(at);
    const hour = parts.find((p) => p.type === "hour")?.value;
    // "24" appears at midnight under hour12:false in some runtimes.
    return Number(hour) % 24;
  } catch {
    return at.getUTCHours();
  }
}

/**
 * Today's date in `timeZone`, YYYY-MM-DD. The briefing_date has to be the
 * reader's date, not UTC's: a 22:00 local briefing in UTC-8 is generated at
 * 06:00 UTC the following day, and keying it on the UTC date would file it
 * under tomorrow and leave today's slot empty.
 */
function dateInZone(at: Date, timeZone: string): string {
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
        .formatToParts(at)
        .map((p) => [p.type, p.value]),
    );
    return `${parts.year}-${parts.month}-${parts.day}`;
  } catch {
    return at.toISOString().slice(0, 10);
  }
}

// Same canonicalisation as src/lib/sectors.ts, so a stored news-category
// preference matches a tagger slug written differently. Kept minimal here
// rather than copying the whole vocabulary: the Settings UI only ever writes
// canonical slugs, and this just has to survive case/punctuation drift.
function canonicalKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  // Scheduled callers must present the shared secret; see _shared/auth.ts.
  const unauthorized = requireCronSecret(req);
  if (unauthorized) return unauthorized;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: settingsRows, error: settingsError } = await supabase
    .from("user_settings")
    .select(
      "user_id, briefing_hour_local, briefing_timezone, briefing_include_holdings, briefing_watchlist_ids, briefing_news_categories",
    );
  if (settingsError) {
    return Response.json({ error: settingsError.message }, { status: 500, headers: corsHeaders });
  }

  const now = new Date();
  const results = [];
  let skipped = 0;

  for (const row of (settingsRows ?? []) as BriefingSettings[]) {
    const user_id = row.user_id;
    const timeZone = row.briefing_timezone || "UTC";
    const wantedHour = row.briefing_hour_local ?? 12;

    // Not this user's hour yet. Counted rather than logged per user, so a run
    // that legitimately generates two briefings does not return a thousand
    // "skipped" rows.
    if (hourInZone(now, timeZone) !== wantedHour) {
      skipped++;
      continue;
    }

    const today = dateInZone(now, timeZone);

    try {
      // Already generated for this reader's today - the hourly schedule means
      // a run can revisit a user whose zone puts them on the same local hour
      // twice around a DST shift.
      const { data: existing } = await supabase
        .from("daily_briefings")
        .select("id")
        .eq("user_id", user_id)
        .eq("briefing_date", today)
        .maybeSingle();
      if (existing) {
        skipped++;
        continue;
      }

      // Which symbols feed the briefing, per Settings > AI Assistant. Mirrors
      // briefingSymbols() in src/lib/ai/briefing.ts - the two have no shared
      // module across the Node/Deno boundary, so a change to one is a change
      // to both.
      const includeHoldings = row.briefing_include_holdings ?? true;
      const watchlistIds = row.briefing_watchlist_ids ?? [];
      const newsCategories = row.briefing_news_categories ?? [];

      const symbolSet = new Set<string>();

      if (includeHoldings) {
        const { data: holdings } = await supabase.from("holdings").select("symbol").eq("user_id", user_id);
        for (const h of (holdings ?? []) as { symbol: string }[]) symbolSet.add(h.symbol);
      }

      let listQuery = supabase.from("watchlists").select("id").eq("user_id", user_id);
      if (watchlistIds.length > 0) listQuery = listQuery.in("id", watchlistIds);
      const { data: lists } = await listQuery;

      const listIds = ((lists ?? []) as { id: string }[]).map((l) => l.id);
      if (listIds.length > 0) {
        const { data: watchlistItems } = await supabase
          .from("watchlist_items")
          .select("symbol")
          .in("watchlist_id", listIds);
        for (const w of (watchlistItems ?? []) as { symbol: string }[]) symbolSet.add(w.symbol);
      }

      const symbols = Array.from(symbolSet);

      let analysisQuery = supabase
        .from("ai_analyses")
        .select("id, scope_value, analysis_type, probability_low, probability_high, confidence_level")
        .eq("status", "validated")
        .order("created_at", { ascending: false })
        .limit(10);
      if (symbols.length > 0) analysisQuery = analysisQuery.in("scope_value", symbols);
      const { data: rawAnalyses } = await analysisQuery;
      // Newest analysis per symbol only - ordered by created_at desc above, so
      // "newest" is "first seen" here. Without this a re-analyzed symbol (real
      // case: MSFT has three stored runs, two landing on identical figures)
      // crowded out everything else in the summary with repeats of itself.
      const seenScopeValues = new Set<string>();
      const analyses = (rawAnalyses ?? []).filter((a: { scope_value: string }) => {
        if (seenScopeValues.has(a.scope_value)) return false;
        seenScopeValues.add(a.scope_value);
        return true;
      });

      const twoWeeksOut = new Date(now);
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

      // Preferred news categories.
      const wanted = new Set(newsCategories.map(canonicalKey).filter(Boolean));
      let news: {
        id: string;
        title: string;
        source_name: string;
        published_at: string;
        sectors: string[];
      }[] = [];
      if (wanted.size > 0) {
        const { data: articles } = await supabase
          .from("news_items")
          .select("id, title, source_name, published_at, sectors")
          .order("published_at", { ascending: false })
          .limit(60);

        news = ((articles ?? []) as typeof news)
          .filter((a) => (a.sectors ?? []).some((s: string) => wanted.has(canonicalKey(s))))
          .slice(0, 5)
          .map((a) => ({
            id: a.id,
            title: a.title,
            source_name: a.source_name,
            published_at: a.published_at,
            sectors: a.sectors ?? [],
          }));
      }

      // News tagging a tracked symbol - always relevant, independent of the
      // category filter. Mirrors symbolNews in src/lib/ai/briefing.ts.
      let symbolNews: {
        id: string;
        title: string;
        source_name: string;
        published_at: string;
        tickers: string[];
      }[] = [];
      if (symbols.length > 0) {
        const tenDaysAgo = new Date(now);
        tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
        const { data: tagged } = await supabase
          .from("news_items")
          .select("id, title, source_name, published_at, tickers")
          .overlaps("tickers", symbols)
          .gte("published_at", tenDaysAgo.toISOString())
          .order("published_at", { ascending: false })
          .limit(6);
        const seen = new Set(news.map((n) => n.id));
        symbolNews = ((tagged ?? []) as typeof symbolNews)
          .filter((a) => !seen.has(a.id))
          .map((a) => ({
            id: a.id,
            title: a.title,
            source_name: a.source_name,
            published_at: a.published_at,
            tickers: (a.tickers ?? []).filter((t: string) => symbols.includes(t)),
          }));
      }

      // Last-session price move per tracked symbol (>= 2%). Same helper as
      // priceMovesFor in src/lib/ai/briefing.ts.
      const priceMoves: { symbol: string; change_pct: number; close: number; as_of: string }[] = [];
      if (symbols.length > 0) {
        // recent_prices gives every symbol its own newest bars; the shared
        // `.in(symbols).order(ts desc).limit(n * 3)` window this replaces
        // dropped any symbol whose newest bar was older than the others'.
        const { data: bars } = await supabase.rpc("recent_prices", { symbols, per_symbol: 3 });
        priceMoves.push(...priceMovesFromBars((bars ?? []) as MoveBar[], 2));
        priceMoves.sort((a, b) => Math.abs(b.change_pct) - Math.abs(a.change_pct));
      }

      const analysisList = analyses ?? [];
      const eventList = events ?? [];

      let summary: string;
      if (symbols.length === 0) {
        summary = includeHoldings
          ? "No holdings or watchlist symbols yet - add some to get a personalized relevance ranking, or ask the assistant about any market/sector/ticker directly."
          : "The watchlists feeding this briefing are empty, and holdings are switched off as a source in Settings. Add symbols, or turn holdings back on, to get a relevance ranking.";
      } else if (
        analysisList.length === 0 &&
        eventList.length === 0 &&
        news.length === 0 &&
        symbolNews.length === 0 &&
        priceMoves.length === 0
      ) {
        summary = `No notable price moves, new research, upcoming events, or stories for your ${symbols.length} tracked symbol${symbols.length === 1 ? "" : "s"} since your last briefing.`;
      } else {
        const parts: string[] = [];
        if (priceMoves.length > 0) {
          parts.push(
            `${priceMoves.length} notable move${priceMoves.length === 1 ? "" : "s"}: ${priceMoves
              .slice(0, 3)
              .map((m) => `${m.symbol} ${m.change_pct > 0 ? "+" : ""}${m.change_pct}%`)
              .join(", ")}${priceMoves.length > 3 ? ", and more" : ""} (as of ${priceMoves[0].as_of}).`,
          );
        }
        if (analysisList.length > 0) {
          parts.push(
            `${analysisList.length} relevant ${analysisList.length === 1 ? "analysis" : "analyses"}: ${analysisList
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
        if (symbolNews.length > 0) {
          parts.push(
            `${symbolNews.length} recent stor${symbolNews.length === 1 ? "y" : "ies"} on your holdings and watchlist.`,
          );
        }
        if (news.length > 0) {
          parts.push(`${news.length} story${news.length === 1 ? "" : " stories"} in your chosen news categories.`);
        }
        summary = parts.join(" ");
      }

      const content = {
        generated_at: now.toISOString(),
        relevant_symbols: symbols,
        summary,
        analyses: analysisList,
        upcoming_events: eventList,
        price_moves: priceMoves,
        symbol_news: symbolNews,
        news,
        sources: {
          holdings: includeHoldings,
          watchlist_count: watchlistIds.length,
          watchlist_ids: watchlistIds.length > 0 ? watchlistIds : null,
          news_categories: newsCategories,
        },
      };

      const { error: upsertError } = await supabase
        .from("daily_briefings")
        .upsert({ user_id, briefing_date: today, content }, { onConflict: "user_id,briefing_date" });

      results.push({ user_id, ok: !upsertError, error: upsertError?.message });
    } catch (err) {
      results.push({ user_id, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return Response.json({ generated: results.length, skipped, results }, { headers: corsHeaders });
});
