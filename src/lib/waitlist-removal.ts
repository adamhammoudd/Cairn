// Taking someone off the waitlist, two ways (audit 2026-10-02, items 3.4 / 3.10):
//   * their personal link  /waitlist/remove?token=...   (no login)
//   * replying STOP to any email we sent them            (/api/email/inbound)
// Both end in the same delete, so "we won't email you again" is one code path.
//
// Pure of I/O: the store is passed in, so the tests drive exactly this code.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isRemovalToken(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

export interface RemovalStore {
  /** Deletes the row with this removal token; returns how many rows went. */
  deleteByToken(token: string): Promise<number>;
  /** Deletes the row with this normalised email; returns how many rows went. */
  deleteByEmail(emailNormalized: string): Promise<number>;
}

export type RemovalResult = "removed" | "not-found" | "invalid";

export async function removeByToken(store: RemovalStore, token: unknown): Promise<RemovalResult> {
  if (!isRemovalToken(token)) return "invalid";
  return (await store.deleteByToken(token.toLowerCase())) > 0 ? "removed" : "not-found";
}

export async function removeByEmail(store: RemovalStore, email: string): Promise<RemovalResult> {
  const normalised = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalised)) return "invalid";
  return (await store.deleteByEmail(normalised)) > 0 ? "removed" : "not-found";
}

// ---- reading an inbound reply ---------------------------------------------

/** "Name <a@b.c>" or "a@b.c" -> "a@b.c" (lower-cased), or null. */
export function parseSender(from: unknown): string | null {
  if (typeof from !== "string") return null;
  const m = /<([^<>\s]+@[^<>\s]+)>/.exec(from) ?? /([^\s<>,;]+@[^\s<>,;]+)/.exec(from);
  return m ? m[1].toLowerCase() : null;
}

/**
 * Is this reply a stop request? The first non-empty line the person actually
 * wrote (quoted text and signatures below it are ignored) must be STOP, or
 * UNSUBSCRIBE, optionally with punctuation. A longer message that merely contains
 * the word is NOT treated as a stop: "please don't stop the beta" must not
 * remove anyone. Those go to a human.
 */
export function isStopReply(text: unknown): boolean {
  if (typeof text !== "string") return false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith(">")) continue; // quoted
    return /^(stop|unsubscribe|remove me)[\s.!]*$/i.test(line);
  }
  return false;
}

export interface InboundMessage {
  from: string | null;
  isStop: boolean;
}

/**
 * Reads the two shapes an inbound-mail webhook sends: a plain
 * { from, subject?, text } object, or the same wrapped as { type: "email.received", data: {...} }
 * (Resend's inbound event). The subject is also accepted, for mail clients that
 * put the word there and leave the body empty.
 */
export function readInbound(payload: unknown): InboundMessage {
  const root = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const body = (root.data && typeof root.data === "object" ? root.data : root) as Record<string, unknown>;
  const from = parseSender(body.from ?? body.sender);
  const text = typeof body.text === "string" ? body.text : "";
  const subject = typeof body.subject === "string" ? body.subject : "";
  return { from, isStop: isStopReply(text) || (text.trim() === "" && isStopReply(subject)) };
}
