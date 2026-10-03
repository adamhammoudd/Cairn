// Audit 2026-10-02, PR 6 (design and accessibility): items 6.1 - 6.4, 6.6, 3.12.
// Source-level checks that stay true as the code changes. The rendered facts
// (one <h1> per page, no sideways scroll, touch targets) come from the fixture
// sweep, scripts/harness/page-facts.ts, whose results are in the PR - it needs a
// running app, so it is not part of run-all.
//
// Run: npx tsx --conditions=react-server scripts/tests/design-a11y.ts

import fs from "node:fs";
import path from "node:path";
import { makeSuite, runIfMain } from "./mini";
import type { SuiteResult } from "./report";

const root = path.resolve(__dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
const walk = (d: string): string[] => fs.readdirSync(path.join(root, d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]));
const code = (s: string) => s.split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

export function runDesignA11ySuite(): SuiteResult {
  const { check, result } = makeSuite("Design and accessibility (headings, focus, tokens, touch targets)");

  // 6.1
  check("6.1 /billing has an h1 (it had only an h2, so the page had none)", /<h1 className="font-serif text-h2 text-primary">Billing<\/h1>/.test(read("src/components/billing/billing-panel.tsx")));
  const noH1 = walk("src/app").filter((f) => /\/page\.tsx$/.test(f)).filter((f) => !/<h1\b/.test(read(f)) && !/(Panel|Workspace|Home|Form|View|Table|Dashboard|Shell|Chat|Thread|Map|Treemap|AuthHeader)\b/.test(read(f)) && !/redirect\(/.test(read(f)));
  check("6.1 every page file that renders its own markup contains an h1", noH1.length === 0, noH1.join(", "));

  // 6.3
  const RING = /focus-visible:ring-2 focus-visible:ring-accent/;
  for (const [f, n] of [["src/components/ticker/discussion-panel.tsx", 3], ["src/components/markets/markets-panel.tsx", 1], ["src/components/chat/chat-thread.tsx", 1]] as const) {
    const lines = read(f).split(/\r?\n/).filter((l) => /outline-none/.test(l) && /className/.test(l));
    const bare = lines.filter((l) => !RING.test(l) && !/focus:border-accent|focus-within/.test(l));
    check(`6.3 ${path.basename(f)}: every outline-none has a visible focus replacement (${lines.length} checked)`, lines.length >= n && bare.length === 0, bare.map((l) => l.trim().slice(0, 60)).join(" | "));
  }
  check("6.3 the ring uses the accent token, not a literal", !/ring-\[#/.test(read("src/components/ticker/discussion-panel.tsx")));
  check("6.3 a global focus-visible rule still exists for everything else", /:where\(a, button, summary, \[tabindex\]:not\(\[tabindex="-1"\]\)\):focus-visible/.test(read("src/app/globals.css")));

  // 6.4
  const hex: string[] = [];
  for (const f of walk("src/components").filter((x) => x.endsWith(".tsx"))) {
    code(read(f)).split(/\r?\n/).forEach((l, i) => { if (/#[0-9a-fA-F]{3,6}\b/.test(l)) hex.push(`${f}:${i + 1}`); });
  }
  check("6.4 no hex colour literal remains in a component", hex.length === 0, hex.slice(0, 5).join(", "));
  const css = read("src/app/globals.css");
  const tokens = ["text-soft", "tint-accent-bg", "tint-accent-text", "tint-warning-border", "tint-warning-text", "legend-neg", "legend-pos"];
  check("6.4 the new tokens are defined and exposed to Tailwind", tokens.every((t) => new RegExp(`--color-${t}: #`).test(css) && new RegExp(`--color-${t}: var\\(--color-${t}\\)`).test(css)));
  const design = read("DESIGN.md");
  const rows = design.slice(design.indexOf("## Type scale"), design.indexOf("### Faces")).split("\n").filter((l) => /^\| `text-/.test(l));
  check("6.4 DESIGN.md says twelve steps and lists twelve", /Twelve steps/.test(design) && rows.length === 12 && !/\bTen steps\b/.test(design), `${rows.length} rows`);
  check("6.4 DESIGN.md no longer claims 10 steps in its summary table", !/\| 10-step scale \|/.test(design) && /12-step scale/.test(design));
  check("6.4 DESIGN.md owns up to the remaining arbitrary text sizes", /Known gap \(2026-10-02\)/.test(design));

  // 6.2 / 6.6 touch targets
  const tapLinks: [string, RegExp][] = [
    ["src/components/legal-shell.tsx", /className="tap inline-flex min-h-11 items-center transition-colors/],
    ["src/components/dashboard/ticker-strip.tsx", /className="tap flex shrink-0/],
    ["src/components/chat/chat-thread.tsx", /className="tap flex h-7 w-7/],
    ["src/components/ticker/discussion-panel.tsx", /className="tap mt-3 inline-flex min-h-11/],
    ["src/components/admin/admin-dashboard.tsx", /className="tap mt-3 inline-flex min-h-11/],
    ["src/app/(app)/watchlists/new/page.tsx", /className="tap inline-flex min-h-11/],
  ];
  for (const [f, re] of tapLinks) check(`6.2/6.6 ${path.basename(f)}: the link carries the 44px touch area`, re.test(read(f)));
  check("6.6 the front-door footer links already have min-h-11", /min-h-11 items-center/.test(read("src/components/front-door/footer.tsx")));
  check("6.2 the touch-area rule these classes rely on exists (pointer: coarse, 44px)", /@media \(pointer: coarse\)[\s\S]*a\.tap/.test(css) && /calc\(\(100% - 44px\) \/ 2\)/.test(css));
  check("6.2 deleting a holding already needs a second step (a confirm dialog) - left as is", /pendingDelete/.test(read("src/components/portfolio/holdings-table.tsx")) && /confirmDelete/.test(read("src/components/portfolio/holdings-table.tsx")));

  // 3.12
  const a11y = read("src/app/accessibility/page.tsx");
  check("3.12 the accessibility page's heading claim says what is actually checked", /exactly one main heading, and headings never skip a level/.test(a11y) && !/single, descending heading structure/.test(a11y));
  check("the fixture sweep that backs the claim is in the repo", fs.existsSync(path.join(root, "scripts/harness/page-facts.ts")) && fs.existsSync(path.join(root, "scripts/harness/fake-supabase.ts")));
  return result();
}

void runIfMain(import.meta.url, runDesignA11ySuite);
