// Types and constants for the calendar module. Kept out of
// lib/actions/calendar.ts for the same reason as lib/screener.ts — a
// "use server" module may only export async functions.

export interface CalendarEvent {
  id: string;
  symbol: string | null;
  event_type: string;
  event_date: string;
  title: string;
}

export const EVENT_TYPES = ["earnings", "economic", "dividend", "ipo", "split"] as const;
