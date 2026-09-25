// hCaptcha, as enforced by Supabase Auth.
//
// CAPTCHA protection is switched on in the Supabase dashboard (Authentication
// -> Attack protection), with the hCaptcha secret stored there. From then on
// Supabase rejects sign-in, sign-up and password-reset requests that do not
// carry a fresh hCaptcha token, and it verifies the token itself - Cairn never
// needs the secret. Cairn's only jobs are to show the widget (the site key is
// public: NEXT_PUBLIC_HCAPTCHA_SITE_KEY) and to pass the token through as
// `captchaToken`.
//
// Pure helpers, shared by the auth and settings server actions and unit
// tested in scripts/tests/captcha.ts.

/** The public site key, or "" when captcha is not configured (local dev without a key). */
export function hcaptchaSiteKey(): string {
  return (process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY ?? "").trim();
}

export function captchaConfigured(): boolean {
  return hcaptchaSiteKey() !== "";
}

/** The token the widget wrote into the form, or undefined. */
export function captchaTokenFrom(formData: FormData): string | undefined {
  const token = String(formData.get("captchaToken") ?? "").trim();
  return token === "" ? undefined : token;
}

export const CAPTCHA_MISSING_MESSAGE = "Please complete the security check, then try again.";
export const CAPTCHA_FAILED_MESSAGE = "The security check expired or failed. Please complete it again.";

/**
 * A message to return before calling Supabase at all, when captcha is on and
 * the form arrived without a token. Saves a round trip and keeps a skipped
 * checkbox from counting as a failed sign-in attempt in the rate limiter.
 */
export function missingCaptchaMessage(formData: FormData): string | null {
  return captchaConfigured() && !captchaTokenFrom(formData) ? CAPTCHA_MISSING_MESSAGE : null;
}

/** True when a Supabase Auth error is the captcha check failing, not the credentials. */
export function isCaptchaError(message: string | undefined | null): boolean {
  return /captcha/i.test(message ?? "");
}

/** Supabase's raw captcha error ("captcha protection: request disallowed ...") in plain words. */
export function friendlyAuthError(message: string): string {
  return isCaptchaError(message) ? CAPTCHA_FAILED_MESSAGE : message;
}
