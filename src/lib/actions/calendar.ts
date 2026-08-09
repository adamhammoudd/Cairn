"use server";

import { createClient } from "@/lib/supabase/server";
import type { CalendarEvent } from "@/lib/calendar";

export async function listUpcomingEvents(types?: string[]): Promise<CalendarEvent[]> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  let query = supabase
    .from("calendar_events")
    .select("id, symbol, event_type, event_date, title")
    .gte("event_date", today)
    .order("event_date", { ascending: true })
    .limit(200);

  if (types && types.length > 0) query = query.in("event_type", types);

  const { data } = await query;
  return data ?? [];
}

// Phase 4 tie-in: given the scopes of stored analyses on screen, return the
// upcoming events for those same symbols so an earnings date can be surfaced
// next to the probability output it's relevant to.
export async function getEventsForScopes(scopeValues: string[]): Promise<Record<string, CalendarEvent[]>> {
  if (scopeValues.length === 0) return {};

  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data } = await supabase
    .from("calendar_events")
    .select("id, symbol, event_type, event_date, title")
    .in("symbol", scopeValues)
    .gte("event_date", today)
    .order("event_date", { ascending: true });

  const bySymbol: Record<string, CalendarEvent[]> = {};
  for (const e of data ?? []) {
    if (!e.symbol) continue;
    (bySymbol[e.symbol] ??= []).push(e);
  }
  return bySymbol;
}
