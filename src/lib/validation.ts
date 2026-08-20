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

/** Rejects NaN/Infinity as well as out-of-range values, which Number() alone does not. */
export function validateNumber(
  raw: unknown,
  field: string,
  { min, max }: { min?: number; max?: number } = {},
): { ok: boolean; value: number; error?: string } {
  const value = Number(raw);
  if (!Number.isFinite(value)) return { ok: false, value: 0, error: `${field} must be a number.` };
  if (min !== undefined && value < min) return { ok: false, value, error: `${field} must be at least ${min}.` };
  if (max !== undefined && value > max) return { ok: false, value, error: `${field} must be at most ${max}.` };
  return { ok: true, value };
}
