// Bug 2026-09-26: the password-reset email linked to a different deployment
// than https://cairn-nu-rouge.vercel.app. forgotPassword() built redirectTo
// from the request's Origin header, which can be missing or be a non-canonical
// alias; Supabase then drops the redirect and falls back to its dashboard Site
// URL. The fix builds it from getSiteUrl() (NEXT_PUBLIC_SITE_URL). This is a
// structural lock so the Origin header does not creep back in.
//
// Run: npx tsx --conditions=react-server scripts/tests/password-reset-redirect.ts

import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const src = readFileSync(join(ROOT, "src/lib/actions/auth.ts"), "utf8");

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean) {
  console.log(`${ok ? "pass" : "FAIL"}  ${name}`);
  if (ok) pass++;
  else fail++;
}

const body = src.slice(src.indexOf("export async function forgotPassword"), src.indexOf("export async function signOut"));
check("forgotPassword is found", body.length > 0);
check("reset redirect is built from getSiteUrl()", /redirectTo:\s*`\$\{getSiteUrl\(\)\}\/reset-password`/.test(body));
check("reset redirect does not read the Origin header", !/get\(\s*["']origin["']\s*\)/i.test(body));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
