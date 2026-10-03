// Audit 2026-10-02 items 4.1 (render child env, live-DB skips), 4.3 (dev origin
// from env), 4.4 (Stripe log, legacy waitlist route), 4.7 (llms.txt), 4.8 (stray
// public files).
//
// Run: npx tsx --conditions=react-server scripts/tests/code-health.ts

import fs from "node:fs";
import path from "node:path";
import { renderChildEnv } from "./render-helper";
import { hasLiveDb, liveDbSkipped } from "./live-db";
import { suiteVerdict } from "./report";
import { logEvent, ref } from "../../src/lib/log";
import Module from "node:module";
import { makeSuite, runIfMain } from "./mini";
import type { SuiteResult } from "./report";

// The legacy page calls next/navigation's redirect(); that module cannot load under
// the react-server condition, so it is replaced for that one file with a stand-in
// that throws the same kind of signal (a destination in the digest).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const M = Module as any;
const realLoad = M._load;
M._load = function (request: string, parent: { filename?: string } | undefined, ...rest: unknown[]) {
  if (request === "next/navigation" && /waitlist[\\/]confirm[\\/]page\.tsx$/.test(parent?.filename ?? "")) {
    return { redirect: (to: string) => { throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${to};307;` }); } };
  }
  return realLoad.call(this, request, parent, ...rest);
};

const root = path.resolve(__dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

export async function runCodeHealthSuite(): Promise<SuiteResult> {
  const { check, eq, result } = makeSuite("Code health (test harness, config, logging, stray files)");

  // ---- 4.1 render child env ------------------------------------------------
  eq("the react-server condition is removed from a render child's NODE_OPTIONS", renderChildEnv({ NODE_OPTIONS: "--conditions=react-server" }).NODE_OPTIONS, undefined);
  eq("other options are kept", renderChildEnv({ NODE_OPTIONS: "--conditions=react-server --max-old-space-size=4096" }).NODE_OPTIONS, "--max-old-space-size=4096");
  eq("the two-token form is handled too", renderChildEnv({ NODE_OPTIONS: "--max-old-space-size=4096 --conditions react-server" }).NODE_OPTIONS, "--max-old-space-size=4096");
  eq("an environment without NODE_OPTIONS is unchanged", renderChildEnv({ FOO: "1" }).FOO, "1");
  check("the parent's own environment is not modified", (() => { const before = process.env.NODE_OPTIONS; renderChildEnv(); return process.env.NODE_OPTIONS === before; })());
  check("all three render children use it", ["scripts/tests/render-helper.ts", "scripts/tests/analysis-display.ts", "scripts/tests/ai-methodology-gaps.ts"].every((f) => /env: renderChildEnv\(\)/.test(read(f))));

  check("no credentials -> hasLiveDb is false", !hasLiveDb({}) && !hasLiveDb({ NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co" }) && hasLiveDb({ NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "k" }));
  const skipped = liveDbSkipped("Citation freshness", "cited sources are not newer than their analysis");
  check("a live-DB suite without credentials is a clearly-worded SKIP, never a pass or a stack trace", skipped.cases.length === 1 && skipped.cases[0].status === "skip" && /not set/.test(skipped.cases[0].detail) && /not a pass/.test(skipped.cases[0].detail) && suiteVerdict(skipped) === "incomplete");
  check("both live-DB suites check for credentials before building a client", /if \(!hasLiveDb\(\)\) return liveDbSkipped/.test(read("scripts/tests/methodology-substance.ts")) && /if \(!hasLiveDb\(\)\) return liveDbSkipped/.test(read("scripts/tests/citation-freshness.ts")));

  // ---- 4.3 ------------------------------------------------------------------
  const cfg = read("next.config.ts");
  check("allowedDevOrigins no longer hard-codes an address", !/192\.168\./.test(cfg.split(/\r?\n/).filter((l) => !l.trim().startsWith("//")).join("\n")) && /process\.env\.ALLOWED_DEV_ORIGINS/.test(cfg));
  check("ALLOWED_DEV_ORIGINS is documented in the env example", /^ALLOWED_DEV_ORIGINS=/m.test(read(".env.local.example")));

  // ---- 4.4 ------------------------------------------------------------------
  const lines: string[] = [];
  const origLog = console.log;
  console.log = (...a: unknown[]) => void lines.push(a.join(" "));
  const USER = "9f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f";
  logEvent("info", "stripe.tier_changed", { account: ref(USER), from: "free", to: "premium" });
  console.log = origLog;
  const parsed = JSON.parse(lines[0] ?? "{}");
  check("the logger writes one JSON line with an event name", parsed.event === "stripe.tier_changed" && parsed.level === "info");
  check("the account is a short hash, never the user id", parsed.account === ref(USER) && parsed.account.length === 10 && !lines[0].includes(USER));
  const hook = read("src/app/api/stripe/webhook/route.ts");
  check("the webhook no longer logs a user id in plain text", !/console\.log\(.*userId/.test(hook) && /logEvent\("info", "stripe\.tier_changed"/.test(hook) && /ref\(result\.userId\)/.test(hook));

  const legacy = read("src/app/waitlist/waitlist/confirm/page.tsx");
  check("the legacy confirm route is kept, with a dated TODO that says when it can go", /TODO\(2026-10-02\)/.test(legacy) && /status = 'pending' and created_at < '2026-09-30'/.test(legacy));
  // Old links still work: the page redirects to the current route, token intact, and is reachable logged out.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { default: LegacyConfirmPage } = require("../../src/app/waitlist/waitlist/confirm/page") as typeof import("../../src/app/waitlist/waitlist/confirm/page");
  let digest = "";
  try {
    await LegacyConfirmPage({ searchParams: Promise.resolve({ token: "11111111-1111-4111-8111-111111111111" }) });
  } catch (e) {
    digest = String((e as { digest?: string }).digest ?? e);
  }
  check("an old confirmation link redirects to /waitlist/confirm with its token", /NEXT_REDIRECT/.test(digest) && digest.includes("/waitlist/confirm?token=11111111-1111-4111-8111-111111111111"), digest);
  const { isPublicPath } = await import("../../src/lib/public-paths");
  check("the old link path is reachable without a session", isPublicPath("/waitlist/waitlist/confirm") && isPublicPath("/waitlist/confirm"));

  // ---- 4.7 ------------------------------------------------------------------
  const llms = read("public/llms.txt");
  check("llms.txt: /welcome no longer claims to explain the plans; /waitlist does", !/\/welcome\):.*plans/.test(llms) && /\/waitlist\):.*what Premium adds/.test(llms), llms.split("\n").filter((l) => /welcome|waitlist/.test(l)).join(" | "));

  // ---- 4.8 ------------------------------------------------------------------
  for (const f of ["Screenshot 2026-09-26 142943.png", "LinkedIN Banner.png", "Non-Transparent Logo.png"]) {
    check(`public/${f} is gone`, !fs.existsSync(path.join(root, "public", f)));
  }
  const refs: string[] = [];
  const scan = (dir: string) => {
    for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) { if (!/node_modules|\.next|\.git$|report$/.test(e.name)) scan(rel); continue; }
      if (!/\.(ts|tsx|md|txt|json|css|mjs|html|sql)$/.test(e.name) || rel.endsWith("code-health.ts")) continue;
      if (/Screenshot 2026|LinkedIN|Non-Transparent|Screenshot%20|Non%20Transparent/.test(read(rel))) refs.push(rel);
    }
  };
  for (const d of ["src", "scripts", "supabase", "docs", "Context"]) if (fs.existsSync(path.join(root, d))) scan(d);
  check("nothing in the repo or in any email template refers to the removed files", refs.length === 0, refs.join(", "));
  check("the files the emails and manifest do use are still there", ["cairn-lockup.png", "cairn-mark.png", "icon-192.png", "icon-512.png", "apple-touch-icon.png"].every((f) => fs.existsSync(path.join(root, "public", f))));
  M._load = realLoad;
  return result();
}

void runIfMain(import.meta.url, runCodeHealthSuite);
