// Types for the calendar_events rows shown next to an analysis. Kept out of
// lib/actions/calendar.ts for the same reason as lib/screener.ts - a
// "use server" module may only export async functions.

export interface CalendarEvent {
  id: string;
  symbol: string | null;
  event_type: string;
  event_date: string;
  title: string;
}

import type { UpcomingEvent } from "@/lib/scorecard";

interface StoredEvent {
  event_type: string;
  event_date: string;
  title: string | null;
  metadata: unknown;
}

/** True for an earnings date ingest-calendar projected from SEC filing history (not confirmed by the company). */
export function isEstimatedEvent(metadata: unknown): boolean {
  return (metadata as { source?: unknown } | null)?.source === "sec_estimate";
}

/**
 * calendar_events rows as the scorecard's upcoming events. A Nasdaq date
 * cites the Nasdaq calendar; an SEC-projected one is marked `estimated` and
 * cites the filing it was projected from, so it is never shown as confirmed.
 */
export function upcomingEventsFromCalendar(rows: StoredEvent[]): UpcomingEvent[] {
  return rows
    .filter((e) => e.event_type === "earnings" || e.event_type === "ex_dividend" || e.event_type === "dividend")
    .map((e) => {
      const date = String(e.event_date);
      const type = e.event_type === "earnings" ? ("earnings" as const) : ("ex_dividend" as const);
      if (isEstimatedEvent(e.metadata)) {
        const m = e.metadata as { based_on?: string; typical_error_days?: number | null };
        const err = m.typical_error_days;
        const miss = typeof err !== "number" ? "" : err === 0 ? "; this matched to the day on its last releases" : `; usually within ${err} day${err === 1 ? "" : "s"}`;
        return {
          type,
          date,
          estimated: true,
          source: { kind: "earnings_release" as const, label: `Estimate from SEC filings: results released ${m.based_on ?? "a year earlier"} + 52 weeks${miss}`, ref: m.based_on ?? date },
        };
      }
      return { type, date, source: { kind: "calendar" as const, label: `Nasdaq calendar: ${e.title ?? e.event_type}`, ref: date } };
    });
}
