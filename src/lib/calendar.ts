// Types and constants for the calendar module. Kept out of
// lib/actions/calendar.ts for the same reason as lib/screener.ts - a
// "use server" module may only export async functions.

export interface CalendarEvent {
  id: string;
  symbol: string | null;
  event_type: string;
  event_date: string;
  title: string;
}

export const EVENT_TYPES = ["earnings", "economic", "dividend", "ipo", "split"] as const;

// Categorical event tints. The design mock assigns accent green to earnings,
// but green carries gain semantics in this product, so earnings takes the
// neutral off-white instead and the other four follow the mock exactly. No
// event type represents a gain, so none of them borrow accent or negative.
export const EVENT_TYPE_TINT: Record<string, string> = {
  earnings: "var(--color-primary)",
  economic: "var(--color-warning)",
  dividend: "var(--color-info)",
  ipo: "var(--color-violet)",
  split: "var(--color-muted)",
};

export function tintForEvent(type: string): string {
  return EVENT_TYPE_TINT[type] ?? "var(--color-muted)";
}
