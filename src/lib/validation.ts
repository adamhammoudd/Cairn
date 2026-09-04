// Server-side input validation.
//
// The client-side fixes that go with these (a selection-only typeahead in
// place of a free-text box) improve the experience but are not a control:
// server actions are HTTP endpoints, and anyone can POST to one without ever
// loading the component. So the rules live here and the actions call them.
//
// The specific failure that prompted this: a watchlist accepted the literal
// string "ZZQQ9!!" with no validation, and it became a permanent dead row
// rendering "- - -" forever, because nothing downstream could resolve it.

import { normalizeSector } from "@/lib/sectors";

/** Longest real ticker is 5 chars plus a class suffix (BRK.B, RDS-A). */
const MAX_SYMBOL_LENGTH = 12;
const SYMBOL_PATTERN = /^[A-Z0-9]{1,10}(?:[.-][A-Z]{1,2})?$/;

export interface ValidationResult {
  ok: boolean;
  value: string;
  error?: string;
}

/**
 * Normalises and validates a ticker. Shape only - it deliberately does not
 * check that the symbol is tracked, because callers that need that do a real
 * lookup against the market-data layer and a second, weaker check here would
 * only be somewhere for the two answers to disagree.
 */
export function validateSymbol(raw: unknown): ValidationResult {
  if (typeof raw !== "string") return { ok: false, value: "", error: "Enter a symbol." };

  const value = raw.trim().toUpperCase();
  if (value.length === 0) return { ok: false, value, error: "Enter a symbol." };
  if (value.length > MAX_SYMBOL_LENGTH) {
    return { ok: false, value, error: `Symbols are at most ${MAX_SYMBOL_LENGTH} characters.` };
  }
  if (!SYMBOL_PATTERN.test(value)) {
    return { ok: false, value, error: `"${raw.trim().slice(0, 20)}" isn't a valid ticker symbol.` };
  }
  return { ok: true, value };
}

/**
 * An alert's `scope_value`. Every alert type watches a ticker; `ai_confidence`
 * alerts may instead watch a sector (that is the one type the evaluator
 * resolves against `ai_analyses.scope_value` rather than a price series).
 *
 * This is the same hardening the watchlist symbol field got after "ZZQQ9!!"
 * became a permanent dead row - a server action is an HTTP endpoint and the
 * typeahead is not in the way of a raw POST. Returns the value to store: an
 * uppercase symbol, or a canonical lowercase sector slug.
 */
export function validateAlertScope(raw: unknown, alertType: string): ValidationResult {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { ok: false, value: "", error: "Pick a ticker or sector to watch." };
  }

  const symbol = validateSymbol(raw);
  if (symbol.ok) return symbol;

  if (alertType === "ai_confidence") {
    const slug = normalizeSector(raw);
    if (slug) return { ok: true, value: slug };
  }

  const noun = alertType === "ai_confidence" ? "ticker or sector" : "ticker symbol";
  return { ok: false, value: raw.trim().toUpperCase(), error: `"${raw.trim().slice(0, 20)}" isn't a valid ${noun}.` };
}

/**
 * Normalises and validates an email address. Shape only - it cannot tell a
 * real inbox from a plausible-looking one, which is why the waitlist confirms
 * by clicking a link sent to the address rather than trusting this check.
 *
 * The pattern is intentionally simple: exactly one `@`, a non-empty local
 * part with no spaces, and a domain with at least one dot and a 2+ char TLD.
 * RFC 5322 in full accepts things (quoted strings, comments, bare TLDs) that
 * no signup form should, and rejecting those here is a feature.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_EMAIL_LENGTH = 254; // RFC 3696 errata: the maximum forward-path length.

export function validateEmail(raw: unknown): ValidationResult {
  if (typeof raw !== "string") return { ok: false, value: "", error: "Enter your email address." };

  // Lower-cased so "A@x.com" and "a@x.com" are one signup, not two. This is the
  // value stored in email_normalized and used as the uniqueness key.
  const value = raw.trim().toLowerCase();
  if (value.length === 0) return { ok: false, value, error: "Enter your email address." };
  if (value.length > MAX_EMAIL_LENGTH) {
    return { ok: false, value, error: "That email address is too long." };
  }
  if (!EMAIL_PATTERN.test(value)) {
    return { ok: false, value, error: "That doesn't look like a valid email address." };
  }
  return { ok: true, value };
}

/**
 * The asset types a holding may carry - kept in sync with the `AssetType`
 * union in supabase/types.ts. A server action is an HTTP endpoint, so the
 * `<select>` in the form is not a control: a raw POST can write any string,
 * and a bogus value breaks the ticker page's stat-grid routing.
 */
export const ASSET_TYPE_VALUES = ["equity", "etf", "crypto", "forex", "index", "future"] as const;
export type AssetTypeValue = (typeof ASSET_TYPE_VALUES)[number];

export function isValidAssetType(value: unknown): value is AssetTypeValue {
  return typeof value === "string" && (ASSET_TYPE_VALUES as readonly string[]).includes(value);
}

/**
 * Guards free-text fields against oversized payloads before they reach the
 * database. Length is checked in code points rather than UTF-16 units so an
 * emoji-heavy string is measured the way a reader would count it.
 */
export function validateText(
  raw: unknown,
  field: string,
  { max, min = 0 }: { max: number; min?: number },
): ValidationResult {
  if (typeof raw !== "string") return { ok: false, value: "", error: `${field} is required.` };
  const value = raw.trim();
  const length = [...value].length;
  if (length < min) return { ok: false, value, error: `${field} must be at least ${min} characters.` };
  if (length > max) return { ok: false, value, error: `${field} must be ${max} characters or fewer.` };
  return { ok: true, value };
}
