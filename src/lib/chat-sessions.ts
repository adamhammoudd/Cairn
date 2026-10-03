// The Assistant's thread list, kept free of duplicates (audit 2026-10-02, item 5.9).
//
// One conversation could appear twice in history. Two ways in, both closed here
// and in chat-thread.tsx:
//  * the list is updated from two places - the row returned when a thread is
//    created, and a full re-read of the list - and nothing stopped the same id
//    arriving through both;
//  * a double Enter / click before React re-rendered ran `send` twice, which
//    created TWO sessions (two real rows, same first message as the title).
//    That one is stopped at the source with a synchronous in-flight guard; a
//    duplicate row already stored is reported, never deleted (see
//    scripts/audit-duplicate-chat-sessions.ts).

export interface SessionLike {
  id: string;
}

/** The list with each id once, keeping the first occurrence (newest-first order is preserved). */
export function uniqueSessions<T extends SessionLike>(list: readonly T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const s of list) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    out.push(s);
  }
  return out;
}

/** Puts a just-created session at the top, unless it is already in the list. */
export function withCreatedSession<T extends SessionLike>(prev: readonly T[], created: T): T[] {
  return prev.some((s) => s.id === created.id) ? [...prev] : [created, ...prev];
}

/**
 * Pairs of stored sessions that look like one conversation created twice: same
 * title, same owner, created within `windowMs` of each other. For reporting only.
 */
export function likelyDoubleInserts<T extends SessionLike & { title: string | null; created_at: string }>(
  list: readonly T[],
  windowMs = 5_000,
): [T, T][] {
  const out: [T, T][] = [];
  const sorted = [...list].filter((s) => s.title).sort((a, b) => a.created_at.localeCompare(b.created_at));
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      if (Date.parse(sorted[j].created_at) - Date.parse(sorted[i].created_at) > windowMs) break;
      if (sorted[i].title === sorted[j].title) out.push([sorted[i], sorted[j]]);
    }
  }
  return out;
}
