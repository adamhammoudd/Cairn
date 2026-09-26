// Mobile layout sweep: every route at phone widths, signed in.
//
// Three steps, run from your own machine against `npm run dev`:
//
//   1. npx tsx scripts/mobile-sweep.ts login [http://localhost:3000]
//      Opens a real (headed) Chromium at /login. Sign in yourself - hCaptcha
//      included; the script never sees or types a password. Once the browser
//      leaves /login the session is saved to .auth/adam.json (gitignored).
//
//   2. npx tsx scripts/mobile-sweep.ts sweep [http://localhost:3000]
//      Headless, with that saved session. Every route at 360/390/430 and 768:
//      screenshots plus measurements, written to mobile-sweep/<timestamp>/
//      (gitignored) as results.json and a route x width table in report.md.
//
//   3. npx tsx scripts/mobile-sweep.ts cleanup
//      Deletes .auth/adam.json. Do this when you are done - it is a live session.
//
// Options (sweep): --state <file> (default .auth/adam.json), --out <dir>,
// --widths 360,390,430,768, --routes /,/portfolio. A route that redirects to
// /welcome, /waitlist or /login is reported NOT SIGNED IN, never PASS.
//
// What is measured, per route and width:
//   - page scroll: documentElement.scrollWidth > innerWidth (sideways scroll)
//   - overflow: elements past the right edge that no clipping or scrolling
//     ancestor contains (deliberate scroll containers are listed separately,
//     with whether they carry an accessible label)
//   - tap targets: links, buttons and inputs smaller than 44x44 CSS px, counting
//     the invisible touch area globals.css adds (inline links inside running
//     text are exempt, as in WCAG 2.5.8). The browser emulates a touch phone.
//   - clipped text: text cut off by overflow without an ellipsis
//   - the analysis "Full breakdown": each row is opened and measured in turn
//   - nav: below 900px, the menu button opens the drawer, every drawer link
//     fits the screen and is 44px tall, and the header search's result menu
//     opens inside the screen
// Overlapping text and chart readability are judged from the screenshots.

import fs from "node:fs";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type CDPSession, type Page } from "playwright";

const DEFAULT_ROUTES = [
  "/", "/portfolio", "/ticker/NVDA", "/ticker/BTC", "/ticker/SPY", "/markets", "/watchlists", "/screener",
  "/comparison", "/research", "/assistant", "/alerts", "/news", "/sector-map", "/settings", "/billing",
  "/waitlist", "/login", "/welcome",
];
const PUBLIC_ROUTES = new Set(["/waitlist", "/login", "/welcome"]);
const SIGNED_OUT = ["/welcome", "/waitlist", "/login"];
const DEFAULT_WIDTHS = [360, 390, 430, 768];
const MIN_TAP = 44;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

function launchOptions(headless: boolean) {
  // Cloud sessions ship Chromium at a fixed path; locally Playwright finds its own.
  const executablePath = process.env.CHROMIUM_PATH || (fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
  return { headless, executablePath, args: ["--no-sandbox", "--disable-dev-shm-usage"] };
}

async function login(base: string, statePath: string) {
  const browser = await chromium.launch(launchOptions(false));
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${base}/login`);
  console.log("Sign in in the browser window (the script waits up to 10 minutes)...");
  await page.waitForURL((u) => !SIGNED_OUT.some((p) => u.pathname.startsWith(p)), { timeout: 10 * 60_000 });
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  await context.storageState({ path: statePath });
  console.log(`Session saved to ${statePath}. Run the sweep, then "cleanup" to delete it.`);
  await browser.close();
}

export interface Measurement {
  scrollWidth: number;
  innerWidth: number;
  pageScrolls: boolean;
  overflow: { sel: string; right: number; text: string }[];
  scrollContainers: { sel: string; scrollWidth: number; clientWidth: number; labelled: boolean }[];
  smallTargets: { sel: string; w: number; h: number; text: string }[];
  clipped: { sel: string; text: string }[];
}

/** Runs in the page. Self-contained: no closures over Node values. */
function measure(minTap: number): Measurement {
  const vw = window.innerWidth;
  const describe = (el: Element) => {
    const id = el.id ? `#${el.id}` : "";
    const cls = typeof el.className === "string" && el.className ? `.${el.className.trim().split(/\s+/).slice(0, 3).join(".")}` : "";
    return `${el.tagName.toLowerCase()}${id}${cls}`;
  };
  const text = (el: Element) => ((el as HTMLElement).innerText || el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 60);
  const visible = (el: Element) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return s.visibility !== "hidden" && s.display !== "none" && r.width > 0 && r.height > 0;
  };
  const clipsX = (el: Element) => ["hidden", "clip", "auto", "scroll"].includes(getComputedStyle(el).overflowX);
  const containedByClipper = (el: Element) => {
    for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
      if (a === document.body) break;
      if (clipsX(a) && a.getBoundingClientRect().right <= vw + 1) return true;
    }
    return false;
  };

  const all = Array.from(document.body.querySelectorAll("*"));
  const overflowing = new Set<Element>();
  for (const el of all) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.right > vw + 1 && !containedByClipper(el) && getComputedStyle(el).position !== "fixed") overflowing.add(el);
  }
  const overflow = Array.from(overflowing)
    .filter((el) => !el.parentElement || !overflowing.has(el.parentElement))
    .map((el) => ({ sel: describe(el), right: Math.round(el.getBoundingClientRect().right), text: text(el) }));

  const scrollContainers = all
    .filter((el) => visible(el) && ["auto", "scroll"].includes(getComputedStyle(el).overflowX) && el.scrollWidth > el.clientWidth + 1)
    .map((el) => ({
      sel: describe(el),
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      labelled: !!(el.getAttribute("aria-label") || el.getAttribute("aria-labelledby")),
    }));

  // The tappable box: the element, or the invisible ::after that globals.css
  // puts around small controls on touch screens, whichever is larger.
  const hitBox = (el: Element) => {
    const r = el.getBoundingClientRect();
    const a = getComputedStyle(el, "::after");
    if (a.content === "none" || a.position !== "absolute") return { w: r.width, h: r.height };
    const px = (v: string) => parseFloat(v) || 0;
    return { w: Math.max(r.width, r.width - px(a.left) - px(a.right)), h: Math.max(r.height, r.height - px(a.top) - px(a.bottom)) };
  };

  const interactive = Array.from(document.querySelectorAll("a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=tab], summary"));
  const smallTargets = interactive
    .filter((el) => {
      if (!visible(el) || el.closest("[aria-hidden=true]") || (el as HTMLElement).closest("[inert]")) return false;
      const r = el.getBoundingClientRect();
      if (r.right < 0 || r.left > vw) return false;
      // Inline links inside running text are exempt (WCAG 2.5.8 "inline").
      if (el.tagName === "A" && getComputedStyle(el).display === "inline" && el.parentElement && /^(P|LI|SPAN|TD)$/.test(el.parentElement.tagName)) return false;
      // A field wrapped by a label is tapped through the label.
      if (el.tagName === "INPUT") {
        const label = el.closest("label");
        if (label) {
          const lr = label.getBoundingClientRect();
          return lr.width < minTap - 0.5 || lr.height < minTap - 0.5;
        }
      }
      const hit = hitBox(el);
      // Half a pixel of slack: a 44px box can measure 43.99 after layout rounding.
      return hit.w < minTap - 0.5 || hit.h < minTap - 0.5;
    })
    .map((el) => {
      const { w, h } = hitBox(el);
      return { sel: describe(el), w: Math.round(w), h: Math.round(h), text: text(el) };
    });

  const clipped: { sel: string; text: string }[] = all
    .filter((el) => {
      if (!visible(el) || !Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent!.trim())) return false;
      const s = getComputedStyle(el);
      // Screen-reader-only text is clipped to 1px on purpose.
      if (el.getBoundingClientRect().width <= 1 || s.clip.startsWith("rect(0")) return false;
      return ["hidden", "clip"].includes(s.overflowX) && s.textOverflow !== "ellipsis" && el.scrollWidth > el.clientWidth + 1;
    })
    .map((el) => ({ sel: describe(el), text: text(el) }));
  // Text cut off by a clipping ancestor (a card with overflow-hidden), which
  // the element's own overflow does not show. Scroll containers are excluded:
  // their content is reachable.
  for (const el of all) {
    if (!visible(el) || !Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent!.trim())) continue;
    if (el.getBoundingClientRect().width <= 1 || getComputedStyle(el).clip.startsWith("rect(0")) continue;
    // A moving ticker tape is clipped on purpose: its text scrolls through view.
    let animated = false;
    for (let a: Element | null = el; a && a !== document.body; a = a.parentElement) {
      const st = getComputedStyle(a);
      if (st.animationName !== "none" && st.animationIterationCount === "infinite") { animated = true; break; }
    }
    if (animated) continue;
    // Text that ends in an ellipsis on purpose (Tailwind `truncate`) is not cut off.
    if (getComputedStyle(el).textOverflow === "ellipsis") continue;
    const range = document.createRange();
    range.selectNodeContents(el);
    const tr = range.getBoundingClientRect();
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const ox = getComputedStyle(a).overflowX;
      if (ox === "auto" || ox === "scroll") break;
      if (ox !== "hidden" && ox !== "clip") continue;
      const ar = a.getBoundingClientRect();
      if (tr.right > ar.right + 1 || tr.left < ar.left - 1) clipped.push({ sel: describe(el), text: text(el) });
      break;
    }
  }

  const scrollWidth = document.documentElement.scrollWidth;
  return { scrollWidth, innerWidth: vw, pageScrolls: scrollWidth > vw, overflow, scrollContainers, smallTargets, clipped };
}

interface NavCheck {
  opened: boolean;
  links: number;
  offscreen: number;
  smallLinks: number;
  /** Right edge of the header search's result menu after typing; null if none showed. */
  searchMenuRight: number | null;
}

async function checkNav(page: Page, shot: string): Promise<NavCheck | null> {
  const toggle = page.locator('button[aria-label="Toggle navigation"]');
  if ((await toggle.count()) === 0 || !(await toggle.isVisible())) return null;
  // The header search's result menu must open inside the screen.
  const search = page.locator("header input").first();
  let searchMenuRight: number | null = null;
  if (await search.isVisible()) {
    await search.fill("N");
    await page.waitForTimeout(700);
    searchMenuRight = await page.evaluate(() => {
      const menu = document.querySelector("header .animate-menu-in");
      return menu ? Math.round(menu.getBoundingClientRect().right) : null;
    });
    await search.fill("");
    await page.keyboard.press("Escape");
  }
  await toggle.click();
  await page.waitForTimeout(400);
  const result = await page.evaluate((minTap) => {
    const drawer = Array.from(document.querySelectorAll("div")).find((d) => getComputedStyle(d).position === "fixed" && d.querySelectorAll("a[href]").length > 5);
    if (!drawer) return { opened: false, links: 0, offscreen: 0, smallLinks: 0, searchMenuRight: null as number | null };
    const links = Array.from(drawer.querySelectorAll("a[href], button"));
    return {
      opened: true,
      links: links.length,
      offscreen: links.filter((l) => l.getBoundingClientRect().right > window.innerWidth + 1).length,
      smallLinks: links.filter((l) => l.getBoundingClientRect().height < minTap).length,
      searchMenuRight: null as number | null,
    };
  }, MIN_TAP);
  result.searchMenuRight = searchMenuRight;
  await screenshot(page, () => page.screenshot({ path: shot }));
  await toggle.click();
  await page.waitForTimeout(250);
  return result;
}

interface RouteResult {
  route: string;
  width: number;
  state: string;
  finalPath: string;
  measurement: Measurement | null;
  nav: NavCheck | null;
  screenshot: string;
  error?: string;
}

function slug(route: string, suffix = "") {
  return (route === "/" ? "home" : route.replace(/^\//, "").replace(/[^a-z0-9]+/gi, "-")) + suffix;
}

async function settle(page: Page) {
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  // Expand collapsed breakdowns so their rows are measured too.
  await page.evaluate(() => document.querySelectorAll("details").forEach((d) => ((d as HTMLDetailsElement).open = true)));
  await page.waitForTimeout(800);
}

// A full-page or element screenshot drops Chromium's touch emulation: after
// one, (pointer: coarse) no longer matches and every later measurement sees a
// desktop mouse. Each screenshot goes through this, which turns it back on.
// The CDP session stays attached: detaching it undoes what it set.
const touchSessions = new WeakMap<Page, CDPSession>();
async function screenshot(page: Page, take: () => Promise<unknown>) {
  await take();
  let cdp = touchSessions.get(page);
  if (!cdp) {
    cdp = await page.context().newCDPSession(page);
    touchSessions.set(page, cdp);
  }
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
}

async function sweepOne(context: BrowserContext, base: string, route: string, width: number, outDir: string): Promise<RouteResult[]> {
  const page = await context.newPage();
  await page.setViewportSize({ width, height: 844 });
  const results: RouteResult[] = [];
  try {
    await page.goto(`${base}${route}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await settle(page);
    const finalPath = new URL(page.url()).pathname;
    const signedOut = !PUBLIC_ROUTES.has(route) && SIGNED_OUT.some((p) => finalPath.startsWith(p));
    const shot = path.join(outDir, `${slug(route)}-${width}.png`);
    const measurement = await page.evaluate(measure, MIN_TAP);
    await screenshot(page, () => page.screenshot({ path: shot, fullPage: true }));
    const nav = width < 900 && !PUBLIC_ROUTES.has(route) ? await checkNav(page, path.join(outDir, `${slug(route)}-${width}-nav.png`)) : null;
    results.push({ route, width, state: signedOut ? "NOT SIGNED IN" : "rendered", finalPath, measurement, nav, screenshot: shot });

    // The analysis "Full breakdown" opens one row at a time: measure each row open.
    if (!signedOut) {
      const section = page.locator("section", { has: page.locator("h2", { hasText: "Full breakdown" }) });
      const rows = section.locator("button[aria-expanded]");
      const n = await rows.count();
      for (let i = 0; i < n; i++) {
        const row = rows.nth(i);
        const label = ((await row.innerText()) || `row${i}`).split("\n")[0].split(" · ")[0].trim();
        if ((await row.getAttribute("aria-expanded")) !== "true") await row.click();
        await settle(page);
        const rowShot = path.join(outDir, `${slug(route, `--breakdown-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`)}-${width}.png`);
        const rowMeasurement = await page.evaluate(measure, MIN_TAP);
        await screenshot(page, () => section.screenshot({ path: rowShot }));
        results.push({ route: `${route} [Breakdown: ${label}]`, width, state: "rendered", finalPath, measurement: rowMeasurement, nav: null, screenshot: rowShot });
      }
    }

    // Tabbed pages (ticker, settings): measure each tab's panel as well.
    if (!signedOut) {
      const tabs = page.locator('[role="tab"]');
      const n = Math.min(await tabs.count(), 8);
      for (let i = 1; i < n; i++) {
        const tab = tabs.nth(i);
        if (!(await tab.isVisible())) continue;
        const label = ((await tab.innerText()) || `tab${i}`).trim();
        await tab.scrollIntoViewIfNeeded();
        await tab.click();
        await settle(page);
        const tabShot = path.join(outDir, `${slug(route, `--${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`)}-${width}.png`);
        const tabMeasurement = await page.evaluate(measure, MIN_TAP);
        await screenshot(page, () => page.screenshot({ path: tabShot, fullPage: true }));
        results.push({ route: `${route} [${label}]`, width, state: "rendered", finalPath, measurement: tabMeasurement, nav: null, screenshot: tabShot });
      }
    }
  } catch (err) {
    results.push({ route, width, state: "ERROR", finalPath: "", measurement: null, nav: null, screenshot: "", error: err instanceof Error ? err.message.split("\n")[0] : String(err) });
  } finally {
    await page.close();
  }
  return results;
}

export function verdict(r: RouteResult): string {
  if (r.state !== "rendered") return r.state === "ERROR" ? `ERROR: ${r.error}` : r.state;
  const m = r.measurement!;
  const problems: string[] = [];
  if (m.pageScrolls) problems.push(`page scrolls sideways (${m.scrollWidth}px)`);
  if (m.overflow.length) problems.push(`${m.overflow.length} past the edge`);
  if (m.clipped.length) problems.push(`${m.clipped.length} clipped`);
  if (m.smallTargets.length) problems.push(`${m.smallTargets.length} targets <${MIN_TAP}px`);
  const unlabelled = m.scrollContainers.filter((c) => !c.labelled).length;
  if (unlabelled) problems.push(`${unlabelled} unlabelled scroll area(s)`);
  if (r.nav && (!r.nav.opened || r.nav.offscreen || r.nav.smallLinks)) problems.push(`nav: ${r.nav.opened ? `${r.nav.offscreen} offscreen, ${r.nav.smallLinks} short links` : "drawer did not open"}`);
  if (r.nav?.searchMenuRight != null && r.nav.searchMenuRight > r.width + 1) problems.push(`search menu runs past the edge (${r.nav.searchMenuRight}px)`);
  return problems.length ? problems.join("; ") : "PASS";
}

async function sweep(base: string, statePath: string | null, outDir: string, routes: string[], widths: number[]) {
  fs.mkdirSync(outDir, { recursive: true });
  const browser: Browser = await chromium.launch(launchOptions(true));
  const cookie = process.env.MOBILE_SWEEP_COOKIE; // name=value, for a local mock backend only
  // A touch device: coarse pointer, no hover - what the phone layout is for.
  const device = { isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
  const context = await browser.newContext(statePath && fs.existsSync(statePath) ? { ...device, storageState: statePath } : device);
  // tsx compiles with keepNames, which wraps functions in a __name() helper that
  // does not exist inside the page; the measuring functions are sent across as-is.
  await context.addInitScript({ content: "window.__name = (f) => f;" });
  if (cookie) {
    const [name, ...rest] = cookie.split("=");
    await context.addCookies([{ name, value: rest.join("="), url: base }]);
  } else if (!statePath || !fs.existsSync(statePath)) {
    console.warn(`No session at ${statePath}: signed-in routes will report NOT SIGNED IN. Run "login" first.`);
  }
  const results: RouteResult[] = [];
  for (const route of routes) {
    for (const width of widths) {
      const rs = await sweepOne(context, base, route, width, outDir);
      for (const r of rs) console.log(`${r.route.padEnd(28)} ${String(r.width).padEnd(4)} ${verdict(r)}`);
      results.push(...rs);
    }
  }
  await browser.close();
  fs.writeFileSync(path.join(outDir, "results.json"), JSON.stringify(results, null, 2));

  const rows = Array.from(new Set(results.map((r) => r.route)));
  const lines = [
    `# Mobile sweep - ${new Date().toISOString()}`,
    "",
    `Base: ${base}. Session: ${cookie ? "local mock backend cookie" : statePath}.`,
    "",
    `| Route | ${widths.join(" | ")} |`,
    `|---|${widths.map(() => "---").join("|")}|`,
    ...rows.map((route) => `| ${route} | ${widths.map((w) => {
      const r = results.find((x) => x.route === route && x.width === w);
      return r ? verdict(r) : "-";
    }).join(" | ")} |`),
    "",
    "## Details",
    ...results
      .filter((r) => r.measurement && verdict(r) !== "PASS")
      .map((r) => {
        const m = r.measurement!;
        const list = (label: string, xs: object[]) => (xs.length ? `  - ${label}: ${xs.slice(0, 8).map((x) => JSON.stringify(x)).join(", ")}` : null);
        return [`- **${r.route} @ ${r.width}**`, list("past the edge", m.overflow), list("clipped", m.clipped), list("small targets", m.smallTargets), list("scroll areas", m.scrollContainers)].filter(Boolean).join("\n");
      }),
  ];
  fs.writeFileSync(path.join(outDir, "report.md"), lines.join("\n") + "\n");
  console.log(`\nReport: ${path.join(outDir, "report.md")}`);
}

async function main() {
  const mode = process.argv[2];
  const base = (process.argv[3] && !process.argv[3].startsWith("--") ? process.argv[3] : "http://localhost:3000").replace(/\/$/, "");
  const statePath = arg("state") ?? ".auth/adam.json";
  if (mode === "login") return login(base, statePath);
  if (mode === "cleanup") {
    fs.rmSync(statePath, { force: true });
    console.log(`Deleted ${statePath}.`);
    return;
  }
  if (mode === "sweep") {
    const outDir = arg("out") ?? path.join("mobile-sweep", new Date().toISOString().replace(/[:.]/g, "-"));
    const routes = arg("routes")?.split(",") ?? DEFAULT_ROUTES;
    const widths = arg("widths")?.split(",").map(Number) ?? DEFAULT_WIDTHS;
    return sweep(base, statePath, outDir, routes, widths);
  }
  console.log("Usage: npx tsx scripts/mobile-sweep.ts login|sweep|cleanup [baseUrl] [--state f] [--out dir] [--widths ...] [--routes ...]");
}

void main();
