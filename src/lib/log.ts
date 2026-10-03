// Structured server logging: one JSON line per event, so a log search can filter
// on `event` and a person is never identifiable from the line itself.
//
// There was no shared logger; call sites used console.log with the user's id
// spelled out (the Stripe webhook logged "user <uuid> free -> premium", audit
// 2026-10-02 item 4.4). Identifiers go through ref() - a short one-way hash that
// still lets one account's events be correlated, but is not the id.

import { createHash } from "node:crypto";

type Level = "info" | "warn" | "error";
type Fields = Record<string, string | number | boolean | null | undefined>;

/** A stable, non-reversible tag for an identifier (account id, customer id): 10 hex characters. */
export function ref(id: string): string {
  return createHash("sha256").update(id).digest("hex").slice(0, 10);
}

export function logEvent(level: Level, event: string, fields: Fields = {}): void {
  const line = JSON.stringify({ level, event, ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
