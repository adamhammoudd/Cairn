// The name a person gives at sign-up. It is stored in profiles.display_name
// (the same column the header and Settings -> Profile already use), copied from
// auth user_metadata.display_name by the handle_new_user trigger.
//
// The rules live here, not in the form: a server action is a plain POST
// endpoint, so the form's checks are a convenience and these are the control.

/** Decision pending with Adam (PR description): optional is the recommendation. */
export const NAME_REQUIRED = false;

export const NAME_MAX_LENGTH = 80;

export const NAME_ERROR_EMPTY = "Enter your name.";
export const NAME_ERROR_TOO_LONG = `Your name can be up to ${NAME_MAX_LENGTH} characters.`;
export const NAME_ERROR_CHARACTERS = "Your name can use letters, spaces, and punctuation, but not emoji or symbols.";

const NAME_ERRORS: readonly string[] = [NAME_ERROR_EMPTY, NAME_ERROR_TOO_LONG, NAME_ERROR_CHARACTERS];

/** True when a sign-up error message belongs next to the name field. */
export function isNameError(message: string | null): boolean {
  return message !== null && NAME_ERRORS.includes(message);
}

// Control characters, emoji, and the bidi overrides that can make a name
// render as something else. Accents, apostrophes, hyphens and every script's
// letters pass.
const REJECTED = /[\p{Cc}\p{Extended_Pictographic}‪-‮⁦-⁩]/u;

export type NameResult = { ok: true; value: string } | { ok: false; error: string };

/** `value` is "" for an optional name left blank; callers then store nothing. */
export function validateDisplayName(raw: unknown): NameResult {
  const value = (typeof raw === "string" ? raw : "").trim();
  if (value === "") return NAME_REQUIRED ? { ok: false, error: NAME_ERROR_EMPTY } : { ok: true, value: "" };
  if (Array.from(value).length > NAME_MAX_LENGTH) return { ok: false, error: NAME_ERROR_TOO_LONG };
  if (REJECTED.test(value)) return { ok: false, error: NAME_ERROR_CHARACTERS };
  return { ok: true, value };
}

/**
 * One or two letters for the avatar badge. Works on whole characters, not
 * UTF-16 units, so "Élodie Dupont" -> "ÉD" and "Adam" -> "AD". Falls back to
 * "?" for an empty string. Not locale-folded: "É" stays "É".
 */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const chars = (word: string, n: number) => Array.from(word.normalize("NFC")).slice(0, n).join("");
  const letters = parts.length === 1 ? chars(parts[0], 2) : chars(parts[0], 1) + chars(parts[1], 1);
  return letters.toLocaleUpperCase();
}
