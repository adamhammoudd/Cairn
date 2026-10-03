// Audit 2026-10-02 item 2.6: nothing reachable over HTTP is open without its
// credential, and no secret reaches the client bundle. Static checks over the
// source, written so that a NEW route or function fails here until someone
// classifies it.
//
//  1. Every src/app/api/**/route.ts is classified and carries its guard.
//  2. Every Edge Function checks the cron secret before doing any work.
//  3. Every "use server" action module's exports read the session, or are on an
//     explicit public/helper allowlist (see ACTION_ALLOWLIST).
//  4. Nothing a Client Component (transitively) imports reads a non-public
//     env var, and NEXT_PUBLIC_* names are not secret-shaped.
//
// Run: npx tsx --conditions=react-server scripts/tests/endpoint-auth-audit.ts

import fs from "node:fs";
import path from "node:path";
import { makeSuite, runIfMain } from "./mini";
import type { SuiteResult } from "./report";

const ROOT = process.env.AUDIT_ROOT ? path.resolve(process.env.AUDIT_ROOT) : path.resolve(__dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
const walk = (dir: string, pred: (f: string) => boolean): string[] =>
  fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = `${dir}/${e.name}`;
    return e.isDirectory() ? walk(rel, pred) : pred(rel) ? [rel] : [];
  });

// ---- 1. API routes: each must name its guard -------------------------------
const ROUTE_GUARDS: Record<string, { why: string; marker: RegExp }> = {
  "src/app/api/chat/route.ts": { why: "signed-in session", marker: /auth\.getUser\(\)[\s\S]*status: 401/ },
  "src/app/api/cron/send-beta-invites/route.ts": { why: "CRON_SECRET bearer", marker: /checkCronAuth\(|authorized\(/ },
  "src/app/api/cron/refresh-fx-rates/route.ts": { why: "CRON_SECRET bearer", marker: /checkCronAuth\(|authorized\(/ },
  "src/app/api/email/inbound/route.ts": { why: "INBOUND_EMAIL_SECRET bearer (503 without it)", marker: /INBOUND_EMAIL_SECRET/ },
  "src/app/api/stripe/webhook/route.ts": { why: "Stripe signature", marker: /constructEvent\(/ },
  "src/app/api/v1/analyses/route.ts": { why: "session", marker: /requireUser\(\)/ },
  "src/app/api/v1/holdings/route.ts": { why: "session", marker: /requireUser\(\)/ },
  "src/app/api/v1/prices/[symbol]/route.ts": { why: "session", marker: /requireUser\(\)/ },
  "src/app/api/v1/watchlists/route.ts": { why: "session", marker: /requireUser\(\)/ },
  // The API index is documentation and returns no account or market data.
  "src/app/api/v1/route.ts": { why: "public documentation, no data", marker: /Cairn API/ },
};

// ---- 3. Server actions: public on purpose, or helpers that are not data ------
const ACTION_ALLOWLIST = new Set([
  "auth.ts:signIn", "auth.ts:signUp", "auth.ts:forgotPassword", "auth.ts:signOut", // credential endpoints, rate-limited
  "waitlist.ts:joinWaitlist", // public form
  "waitlist.ts:removeFromWaitlist", // public by design: the unguessable removal token is the credential
  "billing.ts:getBetaAccessLabel", // a date string
  "billing.ts:getUserPlan", // returns "free" with no session
  "admin.ts:getAdminSnapshot", // isCurrentUserAdmin() inside
  "beta-invites.ts:getBetaInviteAdminView", "beta-invites.ts:sendInviteNowAction", "beta-invites.ts:resendInviteAction", "beta-invites.ts:revokeInviteAction", // currentAdminId() inside
  "analysis.ts:requestAnalysis", // runAnalysisGeneration() checks the session
]);
const SESSION_MARKERS = /getAuthUser\(|auth\.getUser\(|isCurrentUserAdmin\(|currentAdminId\(|requireUser\(/;

// Non-secret settings that shared modules read and a client component also
// imports (they read as undefined in the browser). Reviewed one by one; adding
// to this list is a deliberate act.
const CLIENT_IMPORTABLE_NONSECRET = new Set(["ENABLE_EXPOSURE_FIGURES", "BETA_PREMIUM_UNTIL", "VERCEL_ENV", "VERCEL_URL"]);
const SECRET_SHAPED = /KEY|SECRET|TOKEN|PASSWORD|SALT|SERVICE|DSN|CREDENTIAL/;

function importsOf(file: string, src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/(?:import|export)\s(?!type\s)[^;]*?from\s+["']([^"']+)["']|import\(["']([^"']+)["']\)/g)) {
    const spec = m[1] ?? m[2];
    let base: string | null = null;
    if (spec.startsWith("@/")) base = `src/${spec.slice(2)}`;
    else if (spec.startsWith(".")) base = path.posix.join(path.posix.dirname(file), spec);
    if (!base) continue;
    for (const cand of [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`, base]) {
      if (fs.existsSync(path.join(ROOT, cand)) && fs.statSync(path.join(ROOT, cand)).isFile()) {
        out.push(cand);
        break;
      }
    }
  }
  return out;
}

export function runEndpointAuthAuditSuite(): SuiteResult {
  const { check, result } = makeSuite("Endpoint auth audit (routes, edge functions, actions, client bundle)");

  // 1
  const routes = walk("src/app/api", (f) => f.endsWith("/route.ts"));
  for (const r of routes) {
    const guard = ROUTE_GUARDS[r];
    check(`route ${r.replace("src/app/api", "")} is classified`, !!guard, guard ? guard.why : "new route: add it to ROUTE_GUARDS with its guard");
    if (guard) check(`route ${r.replace("src/app/api", "")} carries its guard (${guard.why})`, guard.marker.test(read(r)));
  }
  // The cron routes must refuse BEFORE doing work, and a missing secret must not pass.
  for (const r of routes.filter((x) => x.includes("/cron/"))) {
    const src = read(r);
    const body = src.slice(src.indexOf("export async function GET"));
    const firstAwait = body.indexOf("await ");
    const refusal = body.indexOf("return NextResponse.json({ error");
    check(`cron route ${r.split("/").slice(-2)[0]} refuses before its first await`, refusal > 0 && refusal < firstAwait, `refusal@${refusal} await@${firstAwait}`);
  }

  // 2
  for (const f of walk("supabase/functions", (p) => p.endsWith("/index.ts"))) {
    const src = read(f);
    const gate = src.indexOf("requireCronSecret(req)");
    const firstWork = Math.min(...["createClient(", "fetch(", "supabase.from("].map((t) => { const i = src.indexOf(t, src.indexOf("Deno.serve")); return i < 0 ? Infinity : i; }));
    check(`edge function ${f.split("/")[2]} checks the cron secret before any work`, gate > 0 && gate < firstWork, `gate@${gate} work@${firstWork}`);
  }
  const authFn = read("supabase/functions/_shared/auth.ts");
  check("requireCronSecret fails closed when CRON_SECRET is unset (503, not 'allow')", /if \(!expected\)[\s\S]*status: 503/.test(authFn));
  check("requireCronSecret compares in constant time", /timingSafeEqual\(presented, expected\)/.test(authFn));

  // 3
  for (const f of walk("src/lib/actions", (p) => p.endsWith(".ts"))) {
    const src = read(f);
    if (!/^"use server"/.test(src)) continue;
    const base = path.posix.basename(f);
    const re = /export async function (\w+)\s*\(/g;
    const hits: { name: string; start: number }[] = [];
    for (let m; (m = re.exec(src)); ) hits.push({ name: m[1], start: m.index });
    hits.forEach((h, i) => {
      const body = src.slice(h.start, hits[i + 1]?.start ?? src.length);
      const key = `${base}:${h.name}`;
      check(`action ${key} checks the session (or is allowlisted)`, SESSION_MARKERS.test(body) || ACTION_ALLOWLIST.has(key));
    });
  }
  check("no server action takes a user id as an argument", (() => {
    const offenders: string[] = [];
    for (const f of walk("src/lib/actions", (p) => p.endsWith(".ts"))) {
      const src = read(f);
      if (!/^"use server"/.test(src)) continue;
      for (const m of src.matchAll(/export async function (\w+)\s*\(([^)]*)\)/g)) if (/\buser_?id\b/i.test(m[2])) offenders.push(`${f}:${m[1]}`);
    }
    return offenders.length === 0 ? true : (console.log(offenders), false);
  })());

  // 4
  const sources = walk("src", (p) => /\.(ts|tsx)$/.test(p));
  const clientRoots = sources.filter((f) => /^\s*["']use client["']/.test(read(f)));
  const seen = new Set<string>();
  const actionStubs = new Set<string>();
  const stack = [...clientRoots];
  while (stack.length) {
    const f = stack.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    // A client component importing a "use server" module gets an RPC stub, not
    // the module: its server-side imports are never bundled for the browser.
    if (/^\s*["']use server["']/.test(read(f))) { actionStubs.add(f); continue; }
    stack.push(...importsOf(f, read(f)));
  }
  const leaks: string[] = [];
  const serverOnly: string[] = [];
  for (const f of seen) {
    if (actionStubs.has(f)) continue;
    const src = read(f);
    for (const m of src.matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
      // Next inlines only NEXT_PUBLIC_* into the browser bundle; anything else
      // is `undefined` there. Not a leak, but a server-side setting read in a
      // module a client component imports is a latent bug, so each one that is
      // allowed is listed here, and none may be secret-shaped.
      const name = m[1];
      const ok = /^(NEXT_PUBLIC_|NODE_ENV$|NEXT_RUNTIME$)/.test(name) || (CLIENT_IMPORTABLE_NONSECRET.has(name) && !SECRET_SHAPED.test(name));
      if (!ok) leaks.push(`${f}: ${name}`);
    }
    if (/^\s*import\s+["']server-only["']/m.test(src)) serverOnly.push(f);
  }
  check(`${clientRoots.length} client components (${seen.size} files in their import graph) read no non-public env var`, leaks.length === 0, leaks.join("; "));
  check("no file marked server-only is in a client component's import graph", serverOnly.length === 0, serverOnly.join("; "));
  const example = read(".env.local.example");
  const publicNames = [...example.matchAll(/^#?\s*(NEXT_PUBLIC_[A-Z0-9_]+)=/gm)].map((m) => m[1]);
  check("NEXT_PUBLIC_* variables are not secret-shaped", publicNames.length > 0 && publicNames.every((n) => !/SECRET|SERVICE|PRIVATE|PASSWORD|TOKEN|ROLE/.test(n)), publicNames.join(", "));
  const nextCfg = read("next.config.ts");
  const envBlock = nextCfg.slice(nextCfg.indexOf("env: {"), nextCfg.indexOf("},", nextCfg.indexOf("env: {")));
  check("next.config.ts env block only exposes NEXT_PUBLIC_ names", [...envBlock.matchAll(/^\s+([A-Z_]+):/gm)].every((m) => m[1].startsWith("NEXT_PUBLIC_")), envBlock.replace(/\s+/g, " ").slice(0, 120));
  return result();
}

void runIfMain(import.meta.url, runEndpointAuthAuditSuite);
