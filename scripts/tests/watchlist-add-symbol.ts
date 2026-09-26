// Browser test for Watchlists "Add symbol" (watchlist-panel.tsx + the shared
// symbol-typeahead.tsx).
//
// QA pass 2026-09-26: every add failed with "Enter a symbol." SymbolTypeahead's
// pick() cleared `selected` when clearOnSelect was set, and the hidden
// <input name="symbol"> reads `selected` - so picking a symbol emptied the one
// field the surrounding <form action={addAction}> submits, and
// addWatchlistItem rejected "". Watchlists was the only caller with a hidden
// field AND clearOnSelect.
//
// Bundles the REAL WatchlistPanel and SymbolTypeahead with esbuild, stubbing
// only the server actions (the add stub runs the real validateSymbol) and
// next/link, then drives it in headless Chromium: type, pick, submit, and
// check the symbol lands in the list. No dev server or sign-in needed.
//
// Run: npx tsx scripts/tests/watchlist-add-symbol.ts

import path from "node:path";
import { build } from "esbuild";
import { chromium, type Page } from "playwright";

const ROOT = path.resolve(__dirname, "../..");
const HERE = path.join(__dirname, "watchlist-add");

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "pass" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
  ok ? pass++ : fail++;
}

const STUBS: Record<string, string> = {
  "@/lib/actions/watchlists": path.join(HERE, "stub-actions-watchlists.ts"),
  "@/lib/actions/symbols": path.join(HERE, "stub-actions-symbols.ts"),
  "next/link": path.join(HERE, "stub-next-link.tsx"),
};

async function bundle(): Promise<string> {
  const out = await build({
    entryPoints: [path.join(HERE, "harness.tsx")],
    bundle: true,
    write: false,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"development"' },
    logLevel: "silent",
    plugins: [
      {
        name: "cairn-resolve",
        setup(b) {
          b.onResolve({ filter: /^(@\/|next\/link$)/ }, async (args) => {
            if (STUBS[args.path]) return { path: STUBS[args.path] };
            const r = await b.resolve(`./${args.path.slice(2)}`, { resolveDir: path.join(ROOT, "src"), kind: args.kind });
            return { path: r.path };
          });
        },
      },
    ],
  });
  return out.outputFiles[0].text;
}

const box = (p: Page) => p.locator('#watchlist input[placeholder="Add symbol (e.g. NVDA)"]');
const hidden = (p: Page) => p.locator('#watchlist input[type="hidden"][name="symbol"]');
const submitted = (p: Page) => p.evaluate(() => (window as unknown as { __store: { submitted: string[] } }).__store.submitted.slice());
const inList = (p: Page, s: string) => p.locator(`#watchlist a[href="/ticker/${s}"]`).count().then((n) => n > 0);
const errorShown = (p: Page) => p.locator("#watchlist").getByText("Enter a symbol.").count().then((n) => n > 0);

async function waitForList(p: Page, s: string) {
  try {
    await p.locator(`#watchlist a[href="/ticker/${s}"]`).waitFor({ timeout: 3000 });
  } catch {
    /* reported by the check that follows */
  }
}

async function main() {
  const js = await bundle();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setContent(`<!doctype html><html><body><div id="root"></div><script>${js.replace(/<\/script/g, "<\\/script")}</script></body></html>`);
  await box(page).waitFor();

  // --- 1. Pick from the dropdown with a click, then click Add --------------
  await box(page).fill("TSL"); // matches TSLA and TSLL, so this is a real choice
  await page.locator("#watchlist button", { hasText: "Tesla" }).click();
  check("dropdown pick: hidden field holds TSLA before submit", (await hidden(page).inputValue()) === "TSLA", await hidden(page).inputValue());
  await page.locator("#watchlist").getByRole("button", { name: "Add", exact: true }).click();
  await waitForList(page, "TSLA");
  check("dropdown pick + Add: form POSTed TSLA", (await submitted(page)).at(-1) === "TSLA", JSON.stringify(await submitted(page)));
  check("dropdown pick + Add: TSLA is in the list", await inList(page, "TSLA"));
  check("dropdown pick + Add: no 'Enter a symbol.'", !(await errorShown(page)));
  check("after a confirmed add: box is reset to empty", (await box(page).inputValue()) === "", await box(page).inputValue());

  // --- 2. Pick with Enter, submit with Enter -------------------------------
  await box(page).fill("NVDA");
  await page.locator("#watchlist button", { hasText: "NVIDIA" }).waitFor();
  await box(page).press("Enter"); // one match: Enter picks it
  check("Enter pick: hidden field holds NVDA", (await hidden(page).inputValue()) === "NVDA", await hidden(page).inputValue());
  await box(page).press("Enter"); // already picked: Enter submits the form
  await waitForList(page, "NVDA");
  check("Enter pick + Enter submit: NVDA is in the list", await inList(page, "NVDA"), JSON.stringify(await submitted(page)));

  // --- 3. A third add still resets (the action returns "saved" every time) -
  await box(page).fill("ISRG");
  await page.locator("#watchlist button", { hasText: "Intuitive" }).waitFor();
  await box(page).press("Enter");
  await page.locator("#watchlist").getByRole("button", { name: "Add", exact: true }).click();
  await waitForList(page, "ISRG");
  check("third add (Enter pick + Add): ISRG is in the list", await inList(page, "ISRG"));
  check("third add: box reset again", (await box(page).inputValue()) === "", await box(page).inputValue());

  // --- 4. Still selection-only: typed-but-not-picked text is never sent ----
  const before = (await submitted(page)).length;
  await box(page).fill("TSLL");
  await page.locator("#watchlist button", { hasText: "Direxion" }).waitFor();
  // Dismiss the dropdown without picking. (The harness has no Tailwind, so an
  // open dropdown sits in normal flow over the Add button.)
  await box(page).press("Escape");
  check("typed, not picked: hidden field stays empty", (await hidden(page).inputValue()) === "", await hidden(page).inputValue());
  await page.locator("#watchlist").getByRole("button", { name: "Add", exact: true }).click();
  await page
    .waitForFunction((n) => (window as unknown as { __store: { submitted: string[] } }).__store.submitted.length > n, before, { timeout: 3000 })
    .catch(() => {});
  check("typed, not picked: form POSTs an empty symbol", (await submitted(page)).at(-1) === "", JSON.stringify(await submitted(page)));
  check("typed, not picked: rejected with 'Enter a symbol.'", await errorShown(page));
  check("typed, not picked: TSLL is NOT in the list", !(await inList(page, "TSLL")));

  // --- 5. name={null} + clearOnSelect (comparison, global search) unchanged
  const nameless = page.locator('#nameless input[placeholder="Nameless picker"]');
  await nameless.fill("NVDA");
  await page.locator("#nameless button", { hasText: "NVIDIA" }).click();
  const picked = await page.evaluate(() => (window as unknown as { __picked: string[] }).__picked.slice());
  check("nameless clearOnSelect picker: onSelect got NVDA", picked.at(-1) === "NVDA", JSON.stringify(picked));
  check("nameless clearOnSelect picker: box emptied on pick", (await nameless.inputValue()) === "", await nameless.inputValue());
  check("nameless picker: renders no hidden field", (await page.locator('#nameless input[type="hidden"]').count()) === 0);
  await nameless.fill("TSL");
  check("nameless picker: searching again after a pick works", await page.locator("#nameless button", { hasText: "Tesla" }).isVisible().catch(() => false) || (await page.locator("#nameless button", { hasText: "Tesla" }).waitFor({ timeout: 2000 }).then(() => true).catch(() => false)));

  check("no uncaught page errors", errors.length === 0, errors.join(" | "));
  await browser.close();

  console.log(`\n${pass}/${pass + fail} watchlist-add-symbol cases passed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
