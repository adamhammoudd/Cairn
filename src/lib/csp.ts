// Content-Security-Policy, built per request so scripts can be allowed by nonce
// instead of 'unsafe-inline' (audit 2026-10-02, item 2.5).
//
// Two modes, chosen by the CSP_MODE env var (read in src/proxy.ts):
//   unset          the legacy static Report-Only policy from next.config.ts
//                  (still allows inline scripts) - nothing changes.
//   "report-only"  this nonce policy, sent as Content-Security-Policy-Report-Only.
//                  Run this on a Vercel preview with the browser console open.
//   "enforce"      the same policy, sent as Content-Security-Policy. Adam's call.
//
// Cost to know about: a page whose scripts carry a per-request nonce cannot be
// served from the static cache, so with CSP_MODE set every page renders per
// request. The app is already behind a per-request auth check, so only the
// public pages (/welcome, /privacy, /terms, ...) change.
//
// style-src keeps 'unsafe-inline': React and Tailwind emit inline style
// attributes, which a nonce cannot cover. That is a much smaller risk than
// inline script and is called out in the PR rather than hidden.

export interface CspInput {
  nonce: string;
  isDev: boolean;
  supabaseOrigin: string;
}

// hCaptcha needs its script, challenge frame, styles and API on hcaptcha.com
// and subdomains - the list hCaptcha documents for CSP.
const HCAPTCHA = "https://hcaptcha.com https://*.hcaptcha.com";

export function buildCsp({ nonce, isDev, supabaseOrigin }: CspInput): string {
  const supabaseConnect = supabaseOrigin ? ` ${supabaseOrigin} ${supabaseOrigin.replace(/^https/, "wss")}` : "";
  return [
    "default-src 'self'",
    // 'strict-dynamic' lets a nonced script load the scripts it needs (Next's
    // chunks, hCaptcha's) without listing hosts; the host list after it is the
    // fallback for browsers that ignore strict-dynamic. No 'unsafe-inline'.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""} ${HCAPTCHA}`,
    `style-src 'self' 'unsafe-inline' ${HCAPTCHA}`,
    `frame-src ${HCAPTCHA}`,
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${supabaseConnect} ${HCAPTCHA}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}

export function newNonce(): string {
  // 128 bits from the platform CSPRNG, base64 - the format CSP nonces use.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

export type CspMode = "report-only" | "enforce" | null;

export function readCspMode(env: Record<string, string | undefined> = process.env): CspMode {
  const v = env.CSP_MODE?.trim().toLowerCase();
  return v === "enforce" ? "enforce" : v === "report-only" ? "report-only" : null;
}

export function cspHeaderName(mode: Exclude<CspMode, null>): string {
  return mode === "enforce" ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only";
}
