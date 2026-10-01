// Guard for feat/front-door-design: the logged-out pages (/welcome, /waitlist
// and its confirm page, the auth pages and the invite sign-up) are built from
// the app's tokens. Before this they held ~147 hand-typed hex colours and 39
// one-off font sizes, on a separate near-black with page-local gradients - the
// front door looked like a different product from the app behind it.
//
// Source check: no hex colour, no rgb()/rgba() literal, no `text-[Npx]` in any
// of these files, and the retired page-local motion and ground are gone.
//
// Run: npx tsx --conditions=react-server scripts/tests/front-door-tokens.ts

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { writeReport, type SuiteResult, type TestCase } from "./report";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export const FRONT_DOOR_FILES = [
  "src/app/welcome/page.tsx",
  "src/app/waitlist/page.tsx",
  "src/app/waitlist/proof-card.tsx",
  "src/app/waitlist/waitlist-form.tsx",
  "src/app/waitlist/confirm/page.tsx",
  "src/app/waitlist/confirm/confirm-view.tsx",
  "src/app/(auth)/layout.tsx",
  "src/app/(auth)/login/page.tsx",
  "src/app/(auth)/signup/page.tsx",
  "src/app/(auth)/signup/signup-form.tsx",
  "src/app/(auth)/signup/invite-invalid.tsx",
  "src/app/(auth)/forgot-password/page.tsx",
  "src/app/(auth)/reset-password/page.tsx",
  "src/components/auth/auth-chrome.tsx",
  "src/components/auth/field.tsx",
  "src/components/front-door/styles.ts",
  "src/components/front-door/header.tsx",
  "src/components/front-door/footer.tsx",
  "src/components/front-door/shell.tsx",
];

/** Every literal in `src` that bypasses the tokens, as "kind: match" strings. */
export function tokenViolations(src: string): string[] {
  const found: string[] = [];
  for (const m of src.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) found.push(`hex: ${m[0]}`);
  for (const m of src.matchAll(/\brgba?\(/g)) found.push(`colour function: ${m[0]}`);
  for (const m of src.matchAll(/\btext-\[[^\]]*px[^\]]*\]/g)) found.push(`font size: ${m[0]}`);
  for (const m of src.matchAll(/\b(?:tracking|leading)-\[[^\]]+\]/g)) found.push(`arbitrary type metric: ${m[0]}`);
  return found;
}

export function runFrontDoorTokensSuite(): SuiteResult {
  const cases: TestCase[] = [];
  const check = (name: string, ok: boolean, detail: string) => cases.push({ name, status: ok ? "pass" : "fail", detail });

  // The detector itself, so a regex that silently matches nothing cannot pass.
  check(
    "detector catches hex, rgba, px font sizes and arbitrary tracking",
    tokenViolations('className="text-[13.5px] tracking-[0.18em] text-[#9a9a9a]" style={{ background: "rgba(47,198,133,.2)" }}').length === 4,
    "4 planted literals",
  );
  check("detector passes token classes", tokenViolations('className="text-body text-muted bg-panel rounded-card"').length === 0, "no literals");

  for (const file of FRONT_DOOR_FILES) {
    const full = path.join(root, file);
    if (!fs.existsSync(full)) {
      check(`${file}: exists`, false, "file missing - update FRONT_DOOR_FILES");
      continue;
    }
    const v = tokenViolations(fs.readFileSync(full, "utf8"));
    check(`${file}: tokens only`, v.length === 0, v.slice(0, 6).join(", ") || "0 literals");
  }

  const all = FRONT_DOOR_FILES.filter((f) => fs.existsSync(path.join(root, f)))
    .map((f) => fs.readFileSync(path.join(root, f), "utf8"))
    .join("\n");
  check("no page-local ground (#080908 / GROUND)", !/080908|\bGROUND\b/.test(all), "the page ground is bg-canvas");
  check("no wl-* keyframes or MarketingMotion", !/\bwl-(?:rise|fade|grow|glow|ping|drift|anim)\b|MarketingMotion/.test(all), "motion comes from the app's tokens");
  check(
    "marketing-motion.tsx is deleted",
    !fs.existsSync(path.join(root, "src/components/marketing-motion.tsx")),
    "no unused page-local motion left behind",
  );
  check(
    "categorical tints are not used as decoration",
    !/\b(?:text|bg|border|from|to)-(?:info|violet)\b/.test(all),
    "info/violet are for chart series and tags",
  );

  const css = fs.readFileSync(path.join(root, "src/app/globals.css"), "utf8");
  check("text-hero and text-hero-sm are tokens in globals.css", /--text-hero:/.test(css) && /--text-hero-sm:/.test(css), "two marketing steps");

  return { suiteName: "Front door uses the app's tokens", gating: true, cases };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const suite = runFrontDoorTokensSuite();
  writeReport([suite]);
  for (const c of suite.cases) console.log(`${c.status === "pass" ? "PASS" : "FAIL"}: ${c.name} - ${c.detail}`);
  if (suite.cases.some((c) => c.status === "fail")) process.exit(1);
}
