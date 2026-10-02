// Opens every page of the app signed in as the FIXTURE account (fake-supabase.ts,
// invented data) at phone and desktop width, takes a full-page screenshot and
// records the facts the design audit asks about: how many <h1>, the title,
// sideways page scroll, elements poking past the right edge, and (with touch
// emulation) controls smaller than 44x44 once the invisible touch area is counted.
//
//   npx tsx scripts/harness/page-facts.ts <baseUrl> <outDir> [--widths 390,1440]
//
// Needs the fake Supabase and `next dev` running against it (see the PR). Never
// pointed at a real database.
import fs from "node:fs";
import path from "node:path";
import { chromium, type Page } from "playwright";

export const ROUTES = [
  "/", "/portfolio", "/ticker/NVDA", "/ticker/BTC", "/markets", "/watchlists", "/watchlists/new", "/screener",
  "/comparison", "/research", "/assistant", "/alerts", "/news", "/sector-map", "/crypto", "/settings", "/billing",
  "/admin", "/admin/invites",
];
export const PUBLIC_ROUTES = ["/welcome", "/waitlist", "/login", "/forgot-password", "/privacy", "/terms", "/refunds", "/accessibility"];

const base = process.argv[2] ?? "http://localhost:3187";
const out = process.argv[3] ?? "page-facts";
const wi = process.argv.indexOf("--widths");
const widths = (wi > -1 ? process.argv[wi + 1] : "390,1440").split(",").map(Number);

const slug = (r: string) => (r === "/" ? "home" : r.replace(/^\//, "").replace(/[^\w]+/g, "-"));

/** Runs in the page. */
function measure() {
  const vw = window.innerWidth;
  const vis = (el: Element) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
  const clipped = (el: Element) => { for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) { if (["hidden", "clip", "auto", "scroll"].includes(getComputedStyle(a).overflowX) && a.getBoundingClientRect().right <= vw + 1) return true; } return false; };
  const desc = (el: Element) => `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\s+/).slice(0, 3).join(".") : ""}`;
  const label = (el: Element) => (((el as HTMLElement).innerText || el.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ")).slice(0, 40);
  const overflow = Array.from(document.body.querySelectorAll("*")).filter((el) => vis(el) && el.getBoundingClientRect().right > vw + 1 && !clipped(el) && getComputedStyle(el).position !== "fixed").slice(0, 6).map((el) => ({ sel: desc(el), right: Math.round(el.getBoundingClientRect().right), text: label(el) }));
  const hit = (el: Element) => {
    const r = el.getBoundingClientRect();
    const a = getComputedStyle(el, "::after");
    if (a.content === "none" || a.position !== "absolute") return { w: r.width, h: r.height };
    return { w: Math.max(r.width, parseFloat(a.width) || 0), h: Math.max(r.height, parseFloat(a.height) || 0) };
  };
  const small = Array.from(document.querySelectorAll("a[href], button, [role=button], [role=tab], summary, input:not([type=hidden]), select")).filter((el) => vis(el) && !(el.tagName === "A" && el.closest("p, li") && (el.parentElement?.textContent ?? "").length > (el.textContent ?? "").length + 20)).map((el) => ({ el, ...hit(el) })).filter((t) => t.w < 43.5 || t.h < 43.5).slice(0, 12).map((t) => ({ sel: desc(t.el), w: Math.round(t.w), h: Math.round(t.h), text: label(t.el) }));
  const h1s = Array.from(document.querySelectorAll("h1")).filter(vis).map((h) => label(h));
  const levels = Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6")).filter(vis).map((h) => Number(h.tagName[1]));
  const skips = levels.filter((l, i) => i > 0 && l > levels[i - 1] + 1).length;
  return { title: document.title, h1s, headingSkips: skips, scrollWidth: document.documentElement.scrollWidth, innerWidth: vw, pageScrolls: document.documentElement.scrollWidth > vw + 1, overflow, small };
}

// A full-page screenshot drops touch emulation, and (pointer: coarse) with it, so it is
// switched on again before every measurement (same as scripts/mobile-sweep.ts).
async function touch(page: Page, on: boolean) {
  if (!on) return;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
}

async function visit(page: Page, route: string, w: number, dir: string) {
  const errors: string[] = [];
  const onErr = (m: { type(): string; text(): string }) => { if (m.type() === "error") errors.push(m.text().slice(0, 140)); };
  page.on("console", onErr);
  const res = await page.goto(base + route, { waitUntil: "networkidle", timeout: 120_000 }).catch((e) => { errors.push(String(e).slice(0, 100)); return null; });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(dir, `${slug(route)}-${w}.png`), fullPage: true }).catch(() => {});
  await touch(page, w < 800);
  const facts = await page.evaluate(measure);
  page.off("console", onErr);
  return { route, width: w, status: res?.status() ?? 0, finalPath: new URL(page.url()).pathname, ...facts, consoleErrors: errors.slice(0, 3) };
}

async function main() {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results: unknown[] = [];
  for (const w of widths) {
    const phone = w < 800;
    const ctx = await browser.newContext({ viewport: { width: w, height: phone ? 844 : 900 }, hasTouch: phone, isMobile: phone, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.addInitScript("window.__name = (f) => f;");
    // Public pages first, signed out.
    for (const r of PUBLIC_ROUTES) results.push(await visit(page, r, w, out));
    // Sign in through the real form against the fixture server.
    await page.goto(base + "/login", { waitUntil: "networkidle" });
    await page.fill('input[name="email"]', "fixture@cairn.test");
    await page.fill('input[name="password"]', "fixture-password");
    await Promise.all([page.waitForURL((u) => u.pathname === "/", { timeout: 60_000 }).catch(() => {}), page.click('button[type="submit"]')]);
    for (const r of ROUTES) results.push(await visit(page, r, w, out));
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(out, "facts.json"), JSON.stringify(results, null, 1));
  type R = { route: string; width: number; status: number; finalPath: string; title: string; h1s: string[]; headingSkips: number; pageScrolls: boolean; overflow: unknown[]; small: unknown[]; consoleErrors: string[] };
  const rows = (results as R[]).map((r) => `| ${r.route} | ${r.width} | ${r.status}${r.finalPath !== r.route ? ` → ${r.finalPath}` : ""} | ${r.title} | ${r.h1s.length} | ${r.headingSkips} | ${r.pageScrolls ? "YES" : "-"} | ${r.overflow.length} | ${r.small.length} |`);
  fs.writeFileSync(path.join(out, "report.md"), `| route | w | status | title | h1 | skips | h-scroll | overflow | small taps |\n|---|---|---|---|---|---|---|---|---|\n${rows.join("\n")}\n`);
  console.log(rows.join("\n"));
}

void main();
