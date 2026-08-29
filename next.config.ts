import type { NextConfig } from "next";

// Supabase is the only cross-origin the app talks to (REST, auth, realtime).
// Derived from the same env var the clients use so the policy cannot drift
// from the project it is meant to allow.
const supabaseOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return "";
  }
})();

const isDev = process.env.NODE_ENV !== "production";

// Content-Security-Policy.
//
// Shipped Report-Only deliberately. A CSP that breaks the app is worse than no
// CSP, because the first thing anyone does with a broken one is delete it. This
// is written to be correct, then wants one pass in a real environment with the
// browser console open before it becomes enforcing - flip the header name to
// "Content-Security-Policy" once that pass is clean, and record it in
// docs/decisions/.
//
// 'unsafe-inline' on script-src is Next's inline bootstrap and hydration data.
// Removing it needs nonce plumbing through src/proxy.ts; that is a real task,
// not a config edit, and is noted in the security report as outstanding.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${supabaseOrigin ? ` ${supabaseOrigin} ${supabaseOrigin.replace(/^https/, "wss")}` : ""}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  // `upgrade-insecure-requests` is deliberately NOT here. The spec makes it a
  // no-op in a Report-Only policy - browsers ignore it and Chrome logs a
  // console warning about it - so shipping it in this header only produced
  // noise and the false impression that upgrades were being enforced. Add it
  // back in the same commit that renames the header below to the enforcing
  // "Content-Security-Policy", not before.
].join("; ");

const securityHeaders = [
  // Clickjacking. frame-ancestors above is the modern control; this is the
  // fallback for anything that still only understands the old header.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Nothing in Cairn uses any of these; deny them rather than inherit defaults.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "Content-Security-Policy-Report-Only", value: csp },
];

// HSTS only in production: sending it from a local http dev server is either
// ignored or, on localhost over https, actively annoying to undo.
if (!isDev) {
  securityHeaders.push({
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  });
}

const nextConfig: NextConfig = {
  // Was in a second, separate next.config.js. Two config files is one config
  // file silently ignored, so they are merged here.
  allowedDevOrigins: ["192.168.0.106"],

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
