// Shared shape for the chat stream's optional trailing state sentinel, plus
// the reset-date wording. A plain module (not "use server") because both the
// route handler and the client component need the type and the marker, and a
// server-actions module may only export async functions.

/**
 * Emitted by /api/chat when a chat-triggered generation ended in a state the
 * UI renders rather than an error: the monthly quota is spent, or the record
 * is too thin for a confidence range. The client turns these into the very
 * same QuotaReachedPanel / UnavailablePanel the Research page shows, so a
 * failure reads identically whichever entry point produced it.
 */
export interface ChatGenerationState {
  kind: "quota" | "unavailable";
  /** The scope that was attempted, for the panel's context. */
  scope: string;
  /** Present only for kind === "quota" - drives the panel's counts and CTA. */
  quota?: {
    used: number;
    limit: number;
    planLabel: string;
    resetLabel: string;
  };
}

// Trailing sentinel, stripped client-side before display - never rendered as
// text. Same mechanism as CAIRN_REFS, and matched at end-of-stream only.
export const CHAT_STATE_MARKER = /\sCAIRN_STATE:(\{.*\})$/;

/**
 * First of next month, spelled the way the mockup's quota copy spells it
 * ("1 September"). Shared by the Research page and the chat quota panel so the
 * reset date is never worded two ways. Matches the calendar-month boundary
 * startOfCurrentMonthIso() counts usage from.
 */
export function nextResetLabel(): string {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return `${next.getDate()} ${next.toLocaleDateString(undefined, { month: "long" })}`;
}
