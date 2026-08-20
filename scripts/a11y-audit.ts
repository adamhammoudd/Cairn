// Wave 8.6: automated WCAG check against the built UI.
//
// Runs axe-core in real Chromium against the pages that can be reached without
// a session. The authenticated surfaces need a live Supabase project and a
// signed-in user, so they are listed as uncovered rather than quietly omitted -
// an accessibility report that does not say what it did not check is the same
// false-green the test suite had.
//
// Usage: next build && next start -p <port>, then
//        npx tsx --conditions=react-server scripts/a11y-audit.ts http://127.0.0.1:<port>

import { chromium } from "playwright";
import { AxeBuilder } from "@axe-core/playwright";

const BASE = process.argv[2] ?? "http://127.0.0.1:3113";

const PUBLIC_PAGES = ["/login", "/signup", "/forgot-password", "/reset-password", "/terms", "/privacy"];

// Reachable only with a session; named so the report is explicit about scope.
const UNCOVERED = [
  "/ (dashboard)", "/markets", "/portfolio", "/watchlists", "/news", "/calendar",
  "/screener", "/comparison", "/alerts", "/assistant", "/research", "/settings",
  "/billing", "/ticker/[symbol]", "/crypto", "/sector-map", "/calculators", "/onboarding",
];

interface Finding {
  page: string;
  id: string;
  impact: string;
  help: string;
  nodes: number;
  sample: string;
}

async function main() {
  // The environment ships Chromium at a fixed path that may not match the
  // build the installed Playwright expects, so point at it explicitly rather
  // than letting Playwright resolve a version it would want to download.
  const executablePath = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
  const browser = await chromium.launch({
    executablePath,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  // axe-core requires an explicit context rather than browser.newPage().
  const context = await browser.newContext();
  const page = await context.newPage();
  const findings: Finding[] = [];
  let scanned = 0;

  for (const path of PUBLIC_PAGES) {
    const res = await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" }).catch(() => null);
    if (!res || !res.ok()) {
      console.log(`SKIP ${path} (HTTP ${res?.status() ?? "no response"})`);
      continue;
    }
    scanned++;

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    for (const v of results.violations) {
      findings.push({
        page: path,
        id: v.id,
        impact: v.impact ?? "unknown",
        help: v.help,
        nodes: v.nodes.length,
        sample: (v.nodes[0]?.html ?? "").slice(0, 140),
      });
    }
    console.log(`${results.violations.length === 0 ? "ok  " : "FAIL"} ${path} - ${results.violations.length} violation type(s)`);
  }

  await context.close();
  await browser.close();

  console.log(`\nScanned ${scanned}/${PUBLIC_PAGES.length} public pages against WCAG 2.1 A/AA.`);
  console.log(`Not covered (need an authenticated session): ${UNCOVERED.length} routes.`);

  if (findings.length === 0) {
    console.log("\nNo violations found on the pages scanned.");
    return;
  }

  console.log(`\n${findings.length} violation type(s):\n`);
  const order = ["critical", "serious", "moderate", "minor", "unknown"];
  findings.sort((a, b) => order.indexOf(a.impact) - order.indexOf(b.impact));
  for (const f of findings) {
    console.log(`  [${f.impact}] ${f.page} - ${f.id}: ${f.help} (${f.nodes} node${f.nodes === 1 ? "" : "s"})`);
    if (f.sample) console.log(`      ${f.sample}`);
  }
  process.exitCode = 1;
}

main();
